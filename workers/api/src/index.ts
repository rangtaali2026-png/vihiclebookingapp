import { createClient } from '@supabase/supabase-js';
import type { Vehicle, CreateBookingPayload } from '@plant-transit/shared-types';

export interface Env {
  ENVIRONMENT?: string;
  FRONTEND_URL?: string;
  CORS_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  NOTIFICATION_QUEUE?: Queue;
}

const ALLOWED_ORIGINS = [
  'https://vehiclebookingapp.pages.dev',
  'http://localhost:3000',
  'http://localhost:5173',
];

function isAllowedOrigin(origin: string, env: Env): boolean {
  if (!origin) return false;
  if (
    origin === 'https://vehiclebookingapp.pages.dev' ||
    /^https:\/\/[a-z0-9-]+\.vehiclebookingapp\.pages\.dev$/.test(origin)
  ) {
    return true;
  }
  if (
    origin === 'http://localhost:3000' ||
    origin === 'http://localhost:5173' ||
    origin.startsWith('http://localhost:')
  ) {
    return true;
  }
  if (env.CORS_ORIGINS) {
    const list = env.CORS_ORIGINS.split(',').map((o) => o.trim());
    if (list.includes('*') || list.includes(origin)) return true;
  }
  return false;
}

function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = isAllowedOrigin(origin, env)
    ? origin
    : (env.FRONTEND_URL || 'https://vehiclebookingapp.pages.dev');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function getSupabase(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health' || path === '/') {
      return jsonResponse({
        status: 'ok',
        service: 'vehiclebookingapp-api',
        phase: 'Phase 2: Inventory & Booking Engine',
        environment: env.ENVIRONMENT || 'production',
        timestamp: new Date().toISOString(),
      }, 200, corsHeaders);
    }

    try {
      const supabase = getSupabase(env);

      // --- FLEET INVENTORY ENDPOINTS ---

      
      // GET /api/drivers?site_id=...
      if (request.method === 'GET' && path === '/api/drivers') {
        const siteId = url.searchParams.get('site_id');
        let query = supabase.from('drivers').select('*').order('name');
        if (siteId) query = query.eq('site_id', siteId);

        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ success: true, drivers: data }, 200, corsHeaders);
      }

      // PATCH /api/dispatch/:id/assign
      if (request.method === 'PATCH' && path.startsWith('/api/dispatch/') && path.endsWith('/assign')) {
        const bookingId = path.split('/')[3];
        const body = await request.json() as { vehicle_id: string; driver_id: string; status?: string };
        const { vehicle_id, driver_id, status = 'DISPATCHED' } = body;

        if (!vehicle_id || !driver_id) {
          return jsonResponse({ error: 'vehicle_id and driver_id are required' }, 400, corsHeaders);
        }

        // Update booking allotment
        const { data: updatedBooking, error: bookingErr } = await supabase
          .from('bookings')
          .update({
            allotted_vehicle_id: vehicle_id,
            allotted_driver_id: driver_id,
            status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bookingId)
          .select()
          .single();

        if (bookingErr) throw bookingErr;

        // Mark driver and vehicle as ON_TRIP if dispatched
        if (status === 'DISPATCHED') {
          await supabase.from('drivers').update({ duty_status: 'ON_TRIP' }).eq('id', driver_id);
          await supabase.from('vehicles').update({ status: 'ON_TRIP' }).eq('id', vehicle_id);
        }

        return jsonResponse({
          success: true,
          booking: updatedBooking,
          message: `Booking successfully assigned and marked as ${status}.`
        }, 200, corsHeaders);
      }

      // PATCH /api/dispatch/:id/complete
      if (request.method === 'PATCH' && path.startsWith('/api/dispatch/') && path.endsWith('/complete')) {
        const bookingId = path.split('/')[3];

        const { data: booking, error: fetchErr } = await supabase
          .from('bookings')
          .select('id, allotted_vehicle_id, allotted_driver_id')
          .eq('id', bookingId)
          .single();

        if (fetchErr || !booking) {
          return jsonResponse({ error: 'Booking not found' }, 404, corsHeaders);
        }

        // Complete booking
        const { data: updatedBooking, error: updateErr } = await supabase
          .from('bookings')
          .update({
            status: 'COMPLETED',
            updated_at: new Date().toISOString()
          })
          .eq('id', bookingId)
          .select()
          .single();

        if (updateErr) throw updateErr;

        // Free vehicle and driver back to AVAILABLE
        if (booking.allotted_vehicle_id) {
          await supabase.from('vehicles').update({ status: 'AVAILABLE' }).eq('id', booking.allotted_vehicle_id);
        }
        if (booking.allotted_driver_id) {
          await supabase.from('drivers').update({ duty_status: 'AVAILABLE' }).eq('id', booking.allotted_driver_id);
        }

        return jsonResponse({
          success: true,
          booking: updatedBooking,
          message: 'Trip completed successfully. Assets returned to available inventory.'
        }, 200, corsHeaders);
      }

      // POST /api/dispatch/verify-boarding
      if (request.method === 'POST' && (path === '/api/dispatch/verify-boarding' || path === '/api/dispatch/verify-boarding/')) {
        const body = await request.json() as { booking_id: string; employee_id: string };
        const { booking_id, employee_id } = body;

        if (!booking_id || !employee_id) {
          return jsonResponse({ error: 'booking_id and employee_id are required' }, 400, corsHeaders);
        }

        const trimmedEmpId = employee_id.trim();

        // 1. Check if passenger exists on manifest (case-insensitive)
        const { data: passengers, error: findErr } = await supabase
          .from('booking_passengers')
          .select('*')
          .eq('booking_id', booking_id)
          .ilike('employee_id', trimmedEmpId);

        if (findErr || !passengers || passengers.length === 0) {
          return jsonResponse({ error: 'Passenger record not found for this trip' }, 404, corsHeaders);
        }

        const targetPassenger = passengers[0];

        // 2. Mark passenger as boarded
        const { data: updated, error: updErr } = await supabase
          .from('booking_passengers')
          .update({
            is_boarded: true,
            boarded_at: new Date().toISOString()
          })
          .eq('id', targetPassenger.id)
          .select()
          .single();

        if (updErr) throw updErr;

        return jsonResponse({
          success: true,
          passenger: updated,
          message: `Verified and boarded: ${updated.employee_name || updated.employee_id}`
        }, 200, corsHeaders);
      }

      
      // GET /api/fleet/vehicles/:id/active-trip
      if (request.method === 'GET' && path.startsWith('/api/fleet/vehicles/') && path.endsWith('/active-trip')) {
        const vehicleId = path.split('/')[4];

        // 1. Fetch vehicle info
        const { data: vehicle, error: vErr } = await supabase
          .from('vehicles')
          .select('id, registration_number, model, seat_capacity, qr_code_uuid')
          .eq('id', vehicleId)
          .single();

        if (vErr || !vehicle) {
          return jsonResponse({ error: 'Vehicle not found' }, 404, corsHeaders);
        }

        // 2. Fetch current DISPATCHED booking
        const { data: activeBooking, error: bErr } = await supabase
          .from('bookings')
          .select('*, booking_passengers(*), drivers!bookings_allotted_driver_id_fkey(name, mobile_number)')
          .eq('allotted_vehicle_id', vehicleId)
          .eq('status', 'DISPATCHED')
          .order('scheduled_start_time', { ascending: false })
          .limit(1)
          .maybeSingle();

        return jsonResponse({
          success: true,
          vehicle,
          active_booking: activeBooking || null,
        }, 200, corsHeaders);
      }

      // POST /api/fleet/vehicles/:id/provision-qr
      if (request.method === 'POST' && path.startsWith('/api/fleet/vehicles/') && path.endsWith('/provision-qr')) {
        const vehicleId = path.split('/')[4];
        const newQrUuid = crypto.randomUUID();
        const qrUrl = `https://vehiclebookingapp.pages.dev/board/${vehicleId}`;

        const { data: updated, error: updErr } = await supabase
          .from('vehicles')
          .update({
            qr_code_uuid: newQrUuid,
            qr_code_url: qrUrl,
            qr_generated_at: new Date().toISOString(),
            qr_version: 1
          })
          .eq('id', vehicleId)
          .select()
          .single();

        if (updErr) throw updErr;

        return jsonResponse({
          success: true,
          vehicle: updated,
          qr_url: qrUrl
        }, 200, corsHeaders);
      }

      // GET /api/fleet/vehicles?site_id=...&category=...
      if (request.method === 'GET' && path === '/api/fleet/vehicles') {
        const siteId = url.searchParams.get('site_id');
        const category = url.searchParams.get('category');

        let query = supabase.from('vehicles').select('*').order('created_at', { ascending: false });
        if (siteId) query = query.eq('site_id', siteId);
        if (category) query = query.eq('category', category);

        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ success: true, vehicles: data }, 200, corsHeaders);
      }

      // POST /api/fleet/vehicles
      if (request.method === 'POST' && path === '/api/fleet/vehicles') {
        const body = await request.json() as Partial<Vehicle>;
        const { site_id, registration_number, model, category } = body;

        if (!site_id || !registration_number || !model || !category) {
          return jsonResponse({ error: 'Missing required vehicle fields' }, 400, corsHeaders);
        }

        const capacityMap: Record<string, number> = {
          'SEDAN_4': 4,
          'MPV_6': 6,
          'BUS_42': 42,
          'BUS_52': 52,
        };

        const total_capacity = body.total_capacity || capacityMap[category] || 4;

        const { data, error } = await supabase.from('vehicles').insert([{
          site_id,
          registration_number: registration_number.trim().toUpperCase(),
          model,
          category,
          total_capacity,
          status: 'AVAILABLE',
          is_active: true,
        }]).select().single();

        if (error) throw error;
        return jsonResponse({ success: true, vehicle: data }, 201, corsHeaders);
      }

      // --- BOOKING ENGINE ENDPOINTS ---

      // POST /api/bookings/reserve (Atomic booking engine)
      if (request.method === 'POST' && path === '/api/bookings/reserve') {
        const payload = await request.json() as CreateBookingPayload;
        const {
          site_id,
          requester_id,
          booking_type,
          target_category,
          preferred_vehicle_id,
          scheduled_start_time,
          scheduled_end_time,
          origin_location,
          destination_location,
          purpose,
          passengers = [],
        } = payload;

        if (!site_id || !requester_id || !scheduled_start_time || !scheduled_end_time || !origin_location || !destination_location) {
          return jsonResponse({ error: 'Missing required reservation fields' }, 400, corsHeaders);
        }

        const passenger_count = Math.max(passengers.length, 1);

        // Call the atomic concurrency PL/pgSQL function created in Supabase
        const { data: bookingId, error: rpcError } = await supabase.rpc('reserve_booking_transaction', {
          p_site_id: site_id,
          p_requester_id: requester_id,
          p_booking_type: booking_type || 'PRIVATE',
          p_target_category: target_category || 'SEDAN_4',
          p_vehicle_id: preferred_vehicle_id || null,
          p_start_time: scheduled_start_time,
          p_end_time: scheduled_end_time,
          p_origin: origin_location,
          p_destination: destination_location,
          p_purpose: purpose || 'Plant Transit',
          p_passenger_count: passenger_count,
        });

        if (rpcError) {
          return jsonResponse({ error: rpcError.message }, 409, corsHeaders);
        }

        // Insert passenger manifest if passengers were specified
        if (passengers.length > 0) {
          const passengerRows = passengers.map(p => ({
            booking_id: bookingId,
            employee_id: p.employee_id,
            employee_name: p.employee_name,
            department: p.department || 'Operations',
            contact_number: p.contact_number,
            pickup_point: p.pickup_point || origin_location,
            drop_point: p.drop_point || destination_location,
            seat_number: p.seat_number || null,
          }));

          const { error: passError } = await supabase.from('booking_passengers').insert(passengerRows);
          if (passError) console.error('Error recording passengers manifest:', passError);
        }

        return jsonResponse({
          success: true,
          booking_id: bookingId,
          message: 'Booking successfully reserved with concurrency guard',
        }, 201, corsHeaders);
      }

      // POST /api/bookings/:id/rebook (Fast 1-Click Re-booking)
      if (request.method === 'POST' && path.startsWith('/api/bookings/') && path.endsWith('/rebook')) {
        const sourceBookingId = path.split('/')[3];
        const { scheduled_start_time, scheduled_end_time } = await request.json() as {
          scheduled_start_time: string;
          scheduled_end_time: string;
        };

        if (!scheduled_start_time || !scheduled_end_time) {
          return jsonResponse({ error: 'New scheduled_start_time and scheduled_end_time are required' }, 400, corsHeaders);
        }

        // Fetch original booking & passengers
        const { data: original, error: fetchErr } = await supabase
          .from('bookings')
          .select('*, booking_passengers(*)')
          .eq('id', sourceBookingId)
          .single();

        if (fetchErr || !original) {
          return jsonResponse({ error: 'Original booking record not found' }, 404, corsHeaders);
        }

        // Reserve cloned itinerary
        const { data: newBookingId, error: rpcError } = await supabase.rpc('reserve_booking_transaction', {
          p_site_id: original.site_id,
          p_requester_id: original.requester_id,
          p_booking_type: original.booking_type,
          p_target_category: original.target_category,
          p_vehicle_id: original.allotted_vehicle_id,
          p_start_time: scheduled_start_time,
          p_end_time: scheduled_end_time,
          p_origin: original.origin_location,
          p_destination: original.destination_location,
          p_purpose: `Rebooked from ${original.booking_reference}: ${original.purpose || ''}`,
          p_passenger_count: original.passenger_count,
        });

        if (rpcError) {
          return jsonResponse({ error: rpcError.message }, 409, corsHeaders);
        }

        // Link parent booking
        await supabase.from('bookings').update({ parent_booking_id: original.id }).eq('id', newBookingId);

        // Copy passenger roster
        if (original.booking_passengers && original.booking_passengers.length > 0) {
          const clonedPassengers = original.booking_passengers.map((p: any) => ({
            booking_id: newBookingId,
            employee_id: p.employee_id,
            employee_name: p.employee_name,
            department: p.department,
            contact_number: p.contact_number,
            pickup_point: p.pickup_point,
            drop_point: p.drop_point,
          }));
          await supabase.from('booking_passengers').insert(clonedPassengers);
        }

        return jsonResponse({
          success: true,
          booking_id: newBookingId,
          rebooked_from: original.booking_reference,
        }, 201, corsHeaders);
      }

            // PATCH /api/bookings/:id/cancel
      if (request.method === 'PATCH' && path.startsWith('/api/bookings/') && path.endsWith('/cancel')) {
        const bookingId = path.split('/')[3];
        
        // Fetch current status
        const { data: booking, error: fetchErr } = await supabase
          .from('bookings')
          .select('id, status, booking_reference')
          .eq('id', bookingId)
          .single();

        if (fetchErr || !booking) {
          return jsonResponse({ error: 'Booking not found' }, 404, corsHeaders);
        }

        if (booking.status === 'CANCELLED') {
          return jsonResponse({ error: 'Booking is already cancelled' }, 400, corsHeaders);
        }

        if (['COMPLETED', 'DISPATCHED'].includes(booking.status)) {
          return jsonResponse({ error: `Cannot cancel a trip that is already ${booking.status.toLowerCase()}` }, 400, corsHeaders);
        }

        const { data: updated, error: updateErr } = await supabase
          .from('bookings')
          .update({
            status: 'CANCELLED',
            updated_at: new Date().toISOString()
          })
          .eq('id', bookingId)
          .select()
          .single();

        if (updateErr) throw updateErr;

        return jsonResponse({
          success: true,
          booking: updated,
          message: `Booking ${booking.booking_reference} has been cancelled successfully.`
        }, 200, corsHeaders);
      }

      // GET /api/bookings?site_id=...&requester_id=...
      if (request.method === 'GET' && path === '/api/bookings') {
        const siteId = url.searchParams.get('site_id');
        const requesterId = url.searchParams.get('requester_id');

        let query = supabase
          .from('bookings')
          .select('*, vehicles!bookings_allotted_vehicle_id_fkey(id, registration_number, model, seat_capacity, status), drivers!bookings_allotted_driver_id_fkey(id, name, mobile_number, license_number, duty_status), booking_passengers(*)')
          .order('scheduled_start_time', { ascending: false })
          .limit(50);

        if (siteId) query = query.eq('site_id', siteId);
        if (requesterId) query = query.eq('requester_id', requesterId);

        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ success: true, bookings: data }, 200, corsHeaders);
      }

      return jsonResponse({ error: 'Endpoint not found', path }, 404, corsHeaders);

    } catch (err: any) {
      console.error('API Error:', err);
      return jsonResponse({ error: err.message || 'Internal Server Error' }, 500, corsHeaders);
    }
  },
};
