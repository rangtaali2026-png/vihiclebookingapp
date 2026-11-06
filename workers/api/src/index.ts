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
        const { site_id, registration_number, make_model, category } = body;

        if (!site_id || !registration_number || !make_model || !category) {
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
          make_model,
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

      // GET /api/bookings?site_id=...&requester_id=...
      if (request.method === 'GET' && path === '/api/bookings') {
        const siteId = url.searchParams.get('site_id');
        const requesterId = url.searchParams.get('requester_id');

        let query = supabase
          .from('bookings')
          .select('*, vehicles(registration_number, make_model, category), booking_passengers(*)')
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
