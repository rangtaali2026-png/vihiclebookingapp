import { createClient } from '@supabase/supabase-js';
import { AuthenticatedRequest, withTenantContext, requireRoles } from '../middleware/tenant';
import type { Env as TenantEnv } from '../middleware/tenant';
import { findBestFitAllotment } from '../services/allotment';
import type { NotificationPayload } from '../../../workers/queue-consumer/src/index';

export interface DispatchEnv extends TenantEnv {
  NOTIFICATIONS_QUEUE: Queue<NotificationPayload>;
}

export interface Env {
  NOTIFICATIONS_QUEUE: Queue;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export async function handleApproveBooking(request: Request, env: Env): Promise<Response> {
  const { bookingId, siteId, vehicleId, driverId } = await request.json();

  // 1. Initialize Supabase Client over HTTPS (Port 443)
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // 2. Atomic state update
  const { data: booking, error: dbError } = await supabase
    .from('bookings')
    .update({
      status: 'APPROVED',
      allotted_vehicle_id: vehicleId,
      allotted_driver_id: driverId,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .eq('site_id', siteId)
    .select('*, requester:users(name, phone, email), vehicle:vehicles(*), driver:drivers(*)')
    .single();

  if (dbError || !booking) {
    return new Response(JSON.stringify({ error: 'Database mutation failed', details: dbError }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. Fire-and-forget message enqueue (Zero client-side blocking)
  await env.NOTIFICATIONS_QUEUE.send({
    eventType: 'BOOKING_DISPATCHED',
    siteId,
    bookingId: booking.id,
    recipientPhone: booking.requester.phone,
    recipientEmail: booking.requester.email,
    payload: {
      requesterName: booking.requester.name,
      vehiclePlate: booking.vehicle.registration_number,
      vehicleModel: booking.vehicle.model,
      driverName: booking.driver.name,
      driverPhone: booking.driver.phone,
      pickupTime: booking.scheduled_start_time,
      origin: booking.origin_location,
      destination: booking.destination_location
    }
  });

  // 4. Return instant response to Plant Client
  return new Response(JSON.stringify({ success: true, message: 'Trip approved and queued.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  // =============================================================================
// File: workers/api/src/routes/dispatch.ts
// Description: Fleet Dispatch Controller: Admin Approvals, Auto-Allotment,
//              Manual Vehicle/Driver Overrides, Cancellations, and Queue Publishing
// Target: Cloudflare Workers (V8 Edge Runtime)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. EXECUTE AUTOMATED ALLOTMENT (TRIGGERED BY USER SUBMISSION OR ADMIN)
// -----------------------------------------------------------------------------
export async function handleAutoAllotBooking(req: AuthenticatedRequest, env: DispatchEnv): Promise<Response> {
  return withTenantContext(req, env, async (authReq) => {
    const { supabase, siteId, userId } = authReq.tenant!;
    const { bookingId } = await req.json<{ bookingId: string }>();

    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'Missing bookingId parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch Booking and Requester Information
    const { data: booking, error: bError } = await supabase
      .from('bookings')
      .select('*, site_users!bookings_requester_id_fkey(full_name, mobile_number)')
      .eq('id', bookingId)
      .eq('site_id', siteId)
      .single();

    if (bError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking record not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (booking.status !== 'PENDING') {
      return new Response(
        JSON.stringify({ error: `Cannot allot vehicle. Current status is ${booking.status}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Run Allotment Heuristic Engine
    const allotment = await findBestFitAllotment(supabase, {
      bookingId: booking.id,
      siteId: booking.site_id,
      targetCategory: booking.target_category,
      passengerCount: booking.passenger_count,
      scheduledStartTime: booking.scheduled_start_time,
      scheduledEndTime: booking.scheduled_end_time,
    });

    if (!allotment.success || !allotment.vehicle || !allotment.driver) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'ALLOTMENT_FAILED',
          message: allotment.rejectionReason || 'No eligible vehicle or driver available.',
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Mutate State to APPROVED with Allotted Fleet & Driver
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'APPROVED',
        allotted_vehicle_id: allotment.vehicle.id,
        allotted_driver_id: allotment.driver.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
      .eq('site_id', siteId);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Update Driver State to ON_TRIP
    await supabase
      .from('drivers')
      .update({ duty_status: 'ON_TRIP' })
      .eq('id', allotment.driver.id);

    // 5. Fire-and-Forget Notifications to Queue (Requester Alert + Driver Run Manifest)
    const requester = booking.site_users as any;
    await queueBookingNotifications(env.NOTIFICATIONS_QUEUE, {
      siteId,
      bookingId: booking.id,
      requesterPhone: requester?.mobile_number,
      requesterName: requester?.full_name,
      driverPhone: allotment.driver.mobile_number,
      driverName: allotment.driver.name,
      vehiclePlate: allotment.vehicle.registration_number,
      vehicleModel: allotment.vehicle.model,
      pickupTime: booking.scheduled_start_time,
      origin: booking.origin_location,
      destination: booking.destination_location,
      passengerCount: booking.passenger_count,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Vehicle and driver auto-allotted successfully.',
        data: {
          bookingId: booking.id,
          vehicle: allotment.vehicle,
          driver: allotment.driver,
          wastedSeats: allotment.wastedSeats,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });
}

// -----------------------------------------------------------------------------
// 2. ADMIN MANUAL OVERRIDE & APPROVAL (PLANT_ADMIN / SUPER_ADMIN ONLY)
// -----------------------------------------------------------------------------
export async function handleAdminOverrideAllotment(req: AuthenticatedRequest, env: DispatchEnv): Promise<Response> {
  return requireRoles(['PLANT_ADMIN', 'SUPER_ADMIN'])(req, env, async (authReq) => {
    const { supabase, siteId, userId } = authReq.tenant!;
    const body = await req.json<{
      bookingId: string;
      vehicleId: string;
      driverId: string;
      reason?: string;
    }>();

    const { bookingId, vehicleId, driverId, reason } = body;

    if (!bookingId || !vehicleId || !driverId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: bookingId, vehicleId, driverId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch Target Booking
    const { data: booking, error: bError } = await supabase
      .from('bookings')
      .select('*, site_users!bookings_requester_id_fkey(full_name, mobile_number)')
      .eq('id', bookingId)
      .eq('site_id', siteId)
      .single();

    if (bError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking record not found' }), { status: 404 });
    }

    // 2. Verify Vehicle and Driver Belong to the Exact Same Tenant Site
    const [vehicleRes, driverRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('id', vehicleId).eq('site_id', siteId).single(),
      supabase.from('drivers').select('*').eq('id', driverId).eq('site_id', siteId).single(),
    ]);

    if (!vehicleRes.data) {
      return new Response(JSON.stringify({ error: 'Invalid vehicle selection or cross-tenant boundary breach.' }), {
        status: 400,
      });
    }

    if (!driverRes.data) {
      return new Response(JSON.stringify({ error: 'Invalid driver selection or cross-tenant boundary breach.' }), {
        status: 400,
      });
    }

    const selectedVehicle = vehicleRes.data;
    const selectedDriver = driverRes.data;

    // 3. Strict Capacity Validation (Vehicle Passenger Seats >= Booking Headcount)
    const usablePassengerSeats = selectedVehicle.seat_capacity - 1;
    if (booking.passenger_count > usablePassengerSeats) {
      return new Response(
        JSON.stringify({
          error: `Capacity constraint violated: Selected vehicle only has ${usablePassengerSeats} passenger seats, but trip requires ${booking.passenger_count}.`,
        }),
        { status: 422 }
      );
    }

    // 4. Free up old driver if reassignment occurs on an already approved booking
    if (booking.allotted_driver_id && booking.allotted_driver_id !== driverId) {
      await supabase
        .from('drivers')
        .update({ duty_status: 'AVAILABLE' })
        .eq('id', booking.allotted_driver_id);
    }

    // 5. Update Booking Status and Assign Fleet
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'APPROVED',
        allotted_vehicle_id: selectedVehicle.id,
        allotted_driver_id: selectedDriver.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
      .eq('site_id', siteId);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 500 });
    }

    // 6. Lock New Driver Duty Status
    await supabase
      .from('drivers')
      .update({ duty_status: 'ON_TRIP' })
      .eq('id', selectedDriver.id);

    // 7. Record Override in Audit Log
    await supabase.from('audit_logs').insert({
      site_id: siteId,
      actor_id: userId,
      action: 'ADMIN_MANUAL_OVERRIDE',
      entity_table: 'bookings',
      entity_id: booking.id,
      payload: {
        overridden_by: userId,
        reason: reason || 'Manual Transport Admin Dispatch Override',
        assigned_vehicle: selectedVehicle.registration_number,
        assigned_driver: selectedDriver.name,
      },
    });

    // 8. Enqueue Dispatched Notifications
    const requester = booking.site_users as any;
    await queueBookingNotifications(env.NOTIFICATIONS_QUEUE, {
      siteId,
      bookingId: booking.id,
      requesterPhone: requester?.mobile_number,
      requesterName: requester?.full_name,
      driverPhone: selectedDriver.mobile_number,
      driverName: selectedDriver.name,
      vehiclePlate: selectedVehicle.registration_number,
      vehicleModel: selectedVehicle.model,
      pickupTime: booking.scheduled_start_time,
      origin: booking.origin_location,
      destination: booking.destination_location,
      passengerCount: booking.passenger_count,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Manual override confirmed. Dispatches triggered.',
        data: {
          bookingId: booking.id,
          vehicle: selectedVehicle,
          driver: selectedDriver,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });
}

// -----------------------------------------------------------------------------
// 3. CANCEL BOOKING & RELEASE ALLOCATIONS (ADMIN OR REQUESTER)
// -----------------------------------------------------------------------------
export async function handleCancelBooking(req: AuthenticatedRequest, env: DispatchEnv): Promise<Response> {
  return withTenantContext(req, env, async (authReq) => {
    const { supabase, siteId, userId, role } = authReq.tenant!;
    const { bookingId, cancellationReason } = await req.json<{
      bookingId: string;
      cancellationReason?: string;
    }>();

    const { data: booking, error: bError } = await supabase
      .from('bookings')
      .select('*, site_users!bookings_requester_id_fkey(full_name, mobile_number)')
      .eq('id', bookingId)
      .eq('site_id', siteId)
      .single();

    if (bError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking record not found' }), { status: 404 });
    }

    // Permission Guard: Requesters can only cancel their own pending/approved bookings
    if (role === 'REQUESTER' && booking.requester_id !== userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized to cancel this reservation.' }), { status: 403 });
    }

    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      return new Response(
        JSON.stringify({ error: `Cannot cancel trip with status ${booking.status}` }),
        { status: 400 }
      );
    }

    // 1. Release Allotted Driver if Assigned
    if (booking.allotted_driver_id) {
      await supabase
        .from('drivers')
        .update({ duty_status: 'AVAILABLE' })
        .eq('id', booking.allotted_driver_id);
    }

    // 2. Mark Booking Cancelled
    await supabase
      .from('bookings')
      .update({
        status: 'CANCELLED',
        rejection_reason: cancellationReason || 'Cancelled by requester/admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    // 3. Mark Participants Cancelled
    await supabase
      .from('trip_participants')
      .update({ check_in_status: 'CANCELLED' })
      .eq('booking_id', booking.id);

    // 4. Send Cancellation Event to Queue
    const requester = booking.site_users as any;
    if (requester?.mobile_number) {
      await env.NOTIFICATIONS_QUEUE.send({
        eventType: 'BOOKING_CANCELLED',
        siteId,
        bookingId: booking.id,
        recipientPhone: requester.mobile_number,
        payload: {
          requesterName: requester.full_name,
          pickupTime: booking.scheduled_start_time,
          reason: cancellationReason || 'Administrative cancellation',
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Booking cancelled and fleet allocations released.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });
}

// -----------------------------------------------------------------------------
// HELPER: ENQUEUE DUAL NOTIFICATIONS (PASSENGER CONFIRMATION + DRIVER RUN SHEET)
// -----------------------------------------------------------------------------
async function queueBookingNotifications(
  queue: Queue<NotificationPayload>,
  data: {
    siteId: string;
    bookingId: string;
    requesterPhone?: string;
    requesterName?: string;
    driverPhone?: string;
    driverName?: string;
    vehiclePlate: string;
    vehicleModel: string;
    pickupTime: string;
    origin: string;
    destination: string;
    passengerCount: number;
  }
) {
  const tasks: Promise<void>[] = [];

  // A. Alert to Requester (Vehicle + Driver assignment)
  if (data.requesterPhone) {
    tasks.push(
      queue.send({
        eventType: 'BOOKING_DISPATCHED',
        siteId: data.siteId,
        bookingId: data.bookingId,
        recipientPhone: data.requesterPhone,
        payload: {
          requesterName: data.requesterName || 'Employee',
          vehiclePlate: data.vehiclePlate,
          vehicleModel: data.vehicleModel,
          driverName: data.driverName || 'Designated Driver',
          driverPhone: data.driverPhone || 'N/A',
          pickupTime: data.pickupTime,
          origin: data.origin,
          destination: data.destination,
        },
      })
    );
  }

  // B. Alert to Driver (Trip assignment, pickup point, authorized passenger count)
  if (data.driverPhone) {
    tasks.push(
      queue.send({
        eventType: 'DRIVER_MANIFEST_ASSIGNED',
        siteId: data.siteId,
        bookingId: data.bookingId,
        recipientPhone: data.driverPhone,
        payload: {
          driverName: data.driverName || 'Driver',
          vehiclePlate: data.vehiclePlate,
          pickupTime: data.pickupTime,
          origin: data.origin,
          destination: data.destination,
          passengerCount: data.passengerCount,
        },
      })
    );
  }

  await Promise.allSettled(tasks);
}

}