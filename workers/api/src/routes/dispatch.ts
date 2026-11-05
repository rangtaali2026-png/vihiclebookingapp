import { createClient } from '@supabase/supabase-js';
import type { Database } from '@plant-transit/shared-types';

export interface NotificationPayload {
  eventType: 'BOOKING_DISPATCHED' | 'BOOKING_CANCELLED' | 'TRIP_COMPLETED' | 'DRIVER_MANIFEST_ASSIGNED';
  siteId: string;
  bookingId: string;
  recipientPhone: string;
  payload: Record<string, any>;
}

export interface DispatchEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  NOTIFICATIONS_QUEUE?: Queue<NotificationPayload>;
}

export interface AuthenticatedUser {
  userId: string;
  siteId: string;
  role: 'SUPER_ADMIN' | 'PLANT_ADMIN' | 'REQUESTER' | 'DRIVER';
}

/**
 * Extracts and verifies the tenant context from the authorization header.
 */
async function authenticateRequest(req: Request, env: DispatchEnv): Promise<{ user: AuthenticatedUser; supabase: any }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }

  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error('Invalid or expired authentication token');
  }

  // Extract site tenancy from user metadata or profile
  const siteId = (user.app_metadata?.site_id || user.user_metadata?.site_id || req.headers.get('X-Tenant-Override')) as string;
  const role = (user.app_metadata?.role || user.user_metadata?.role || 'REQUESTER') as AuthenticatedUser['role'];

  return {
    user: {
      userId: user.id,
      siteId,
      role,
    },
    supabase,
  };
}

// -----------------------------------------------------------------------------
// 1. AUTO-ALLOT BOOKING
// -----------------------------------------------------------------------------
export async function handleAutoAllotBooking(req: Request, env: DispatchEnv): Promise<Response> {
  try {
    const { user, supabase } = await authenticateRequest(req, env);
    const body = await req.json<{ bookingId: string }>().catch(() => ({ bookingId: '' }));

    if (!body.bookingId) {
      return new Response(JSON.stringify({ error: 'Missing bookingId parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch target booking
    const { data: booking, error: bError } = await supabase
      .from('bookings')
      .select('*, requester:site_users!bookings_requester_id_fkey(full_name, mobile_number)')
      .eq('id', body.bookingId)
      .eq('site_id', user.siteId)
      .single();

    if (bError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking record not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Select eligible available vehicle and driver
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('*')
      .eq('site_id', user.siteId)
      .eq('status', 'ACTIVE')
      .gte('seat_capacity', (booking.passenger_count || 1) + 1)
      .limit(1)
      .maybeSingle();

    const { data: driver } = await supabase
      .from('drivers')
      .select('*')
      .eq('site_id', user.siteId)
      .eq('duty_status', 'AVAILABLE')
      .limit(1)
      .maybeSingle();

    if (!vehicle || !driver) {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'NO_FLEET_AVAILABLE',
          message: 'No available vehicle or driver matching the requested passenger capacity.',
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Update booking status
    await supabase
      .from('bookings')
      .update({
        status: 'APPROVED',
        allotted_vehicle_id: vehicle.id,
        allotted_driver_id: driver.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    // 4. Update driver status
    await supabase.from('drivers').update({ duty_status: 'ON_TRIP' }).eq('id', driver.id);

    // 5. Enqueue notification if queue producer is bound
    if (env.NOTIFICATIONS_QUEUE && booking.requester?.mobile_number) {
      await env.NOTIFICATIONS_QUEUE.send({
        eventType: 'BOOKING_DISPATCHED',
        siteId: user.siteId,
        bookingId: booking.id,
        recipientPhone: booking.requester.mobile_number,
        payload: {
          requesterName: booking.requester.full_name,
          vehiclePlate: vehicle.registration_number,
          driverName: driver.name,
          driverPhone: driver.mobile_number,
          pickupTime: booking.scheduled_start_time,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Vehicle auto-allotted successfully.',
        data: { bookingId: booking.id, vehicle, driver },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// -----------------------------------------------------------------------------
// 2. ADMIN MANUAL OVERRIDE
// -----------------------------------------------------------------------------
export async function handleAdminOverrideAllotment(req: Request, env: DispatchEnv): Promise<Response> {
  try {
    const { user, supabase } = await authenticateRequest(req, env);

    if (user.role !== 'PLANT_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return new Response(JSON.stringify({ error: 'Forbidden: Insufficient privileges' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json<{ bookingId: string; vehicleId: string; driverId: string; reason?: string }>();

    if (!body.bookingId || !body.vehicleId || !body.driverId) {
      return new Response(JSON.stringify({ error: 'Missing required assignment fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('*, requester:site_users!bookings_requester_id_fkey(full_name, mobile_number)')
      .eq('id', body.bookingId)
      .eq('site_id', user.siteId)
      .single();

    if (!booking) {
      return new Response(JSON.stringify({ error: 'Booking record not found' }), { status: 404 });
    }

    await supabase
      .from('bookings')
      .update({
        status: 'APPROVED',
        allotted_vehicle_id: body.vehicleId,
        allotted_driver_id: body.driverId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    await supabase.from('drivers').update({ duty_status: 'ON_TRIP' }).eq('id', body.driverId);

    return new Response(
      JSON.stringify({ success: true, message: 'Manual override confirmed.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// -----------------------------------------------------------------------------
// 3. CANCEL BOOKING
// -----------------------------------------------------------------------------
export async function handleCancelBooking(req: Request, env: DispatchEnv): Promise<Response> {
  try {
    const { user, supabase } = await authenticateRequest(req, env);
    const body = await req.json<{ bookingId: string; reason?: string }>();

    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', body.bookingId)
      .eq('site_id', user.siteId)
      .single();

    if (!booking) {
      return new Response(JSON.stringify({ error: 'Booking record not found' }), { status: 404 });
    }

    if (booking.allotted_driver_id) {
      await supabase.from('drivers').update({ duty_status: 'AVAILABLE' }).eq('id', booking.allotted_driver_id);
    }

    await supabase
      .from('bookings')
      .update({
        status: 'CANCELLED',
        rejection_reason: body.reason || 'Cancelled by admin/requester',
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Booking cancelled and driver released.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
