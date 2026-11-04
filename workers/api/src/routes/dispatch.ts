import { createClient } from '@supabase/supabase-js';

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
}