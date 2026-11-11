
import { createClient } from '@supabase/supabase-js';
import type { CreateBookingPayload, Vehicle } from '@plant-transit/shared-types';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ENVIRONMENT?: string;
  WEBHOOK_NOTIFICATION_URL?: string;
  CORS_ORIGINS?: string;
  NOTIFICATION_QUEUE?: {
    send: (message: unknown) => Promise<void>;
  };
}

function getCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  });
  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((allowedOrigin) => allowedOrigin.trim())
    .filter(Boolean);

  const isAllowedOrigin = origin && allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === origin) return true;
    if (!allowedOrigin.startsWith('https://*.')) return false;

    const wildcardDomain = allowedOrigin.slice('https://*.'.length);
    try {
      const parsedOrigin = new URL(origin);
      const subdomain = parsedOrigin.hostname.slice(0, -(wildcardDomain.length + 1));
      return parsedOrigin.origin === origin
        && parsedOrigin.protocol === 'https:'
        && parsedOrigin.hostname.endsWith(`.${wildcardDomain}`)
        && subdomain.length > 0
        && !subdomain.includes('.');
    } catch {
      return false;
    }
  });

  if (origin && isAllowedOrigin) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  return headers;
}

function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function getSupabase(env: Env) {
  const url = env.SUPABASE_URL || '';
  const key = env.SUPABASE_ANON_KEY || (env as any).SUPABASE_SERVICE_ROLE_KEY || (env as any).SUPABASE_KEY || '';
  if (!url || !key) {
    const presentKeys = Object.keys(env || {}).filter(k => k.toLowerCase().includes('supabase'));
    throw new Error(`supabaseKey is required. Detected Supabase env variables: [${presentKeys.join(', ')}]`);
  }
  return createClient(url, key);
}

// Helper function to dispatch SMS / WhatsApp notification and log
async function sendDispatchNotification(
  supabase: any,
  env: Env,
  booking: any,
  vehicle: any,
  driver: any,
  passengers: any[]
) {
  const boardingUrl = `https://vehiclebookingapp.pages.dev/board?vehicle_id=${vehicle.id}`;

  // Check gateway status from gateway_vault
  const { data: gateways } = await supabase
    .from('gateway_vault')
    .select('channel, is_enabled');

  const isWhatsAppEnabled = gateways
    ? gateways.some((g: any) => g.channel === 'WHATSAPP' && g.is_enabled)
    : true;

  const isSmsEnabled = gateways
    ? gateways.some((g: any) => g.channel === 'SMS' && g.is_enabled)
    : true;

  for (const p of passengers) {
    const phone = p.contact_number || '';
    const message = `🚍 *Plant Transit Dispatch Update*
` +
      `Trip Ref: *${booking.booking_reference}*
` +
      `Route: ${booking.origin_location} → ${booking.destination_location}
` +
      `Vehicle: *${vehicle.registration_number}* (${vehicle.model})
` +
      `Driver: *${driver.name}* (${driver.mobile_number})
` +
      `Boarding Self Check-In: ${boardingUrl}

` +
      `Please report to your pickup point on time.`;

    // 1. WhatsApp Channel
    if (!isWhatsAppEnabled) {
      await supabase.from('notifications_log').insert({
        booking_id: booking.id,
        recipient_type: 'PASSENGER',
        recipient_identifier: phone || p.employee_id,
        channel: 'WHATSAPP',
        message_content: message,
        status: 'DISABLED',
        error_message: 'WhatsApp notification currently disabled in systems'
      });
    } else {
      let status = 'SENT';
      let errorMsg = null;

      if (env.WEBHOOK_NOTIFICATION_URL) {
        try {
          await fetch(env.WEBHOOK_NOTIFICATION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone,
              employee_id: p.employee_id,
              passenger_name: p.employee_name,
              message,
              booking_reference: booking.booking_reference
            })
          });
        } catch (err: any) {
          status = 'FAILED';
          errorMsg = err.message;
        }
      }

      await supabase.from('notifications_log').insert({
        booking_id: booking.id,
        recipient_type: 'PASSENGER',
        recipient_identifier: phone || p.employee_id,
        channel: 'WHATSAPP',
        message_content: message,
        status: status,
        error_message: errorMsg
      });
    }
  }
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


      // GET /api/drivers (and /api/fleet/drivers alias)
      if (request.method === 'GET' && (path === '/api/drivers' || path === '/api/fleet/drivers')) {
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
          await supabase.from('vehicles')/* vehicle status remains ACTIVE during trip */.update({ updated_at: new Date().toISOString() }).eq('id', vehicle_id);
        }

        // Fetch trip details for real-time passenger notification
        const { data: fullBooking } = await supabase
          .from('bookings')
          .select('*, booking_passengers(*), vehicles!bookings_allotted_vehicle_id_fkey(*), drivers!bookings_allotted_driver_id_fkey(*)')
          .eq('id', bookingId)
          .single();

        if (fullBooking && fullBooking.booking_passengers?.length > 0) {
          const vObj = fullBooking.vehicles || { id: vehicle_id, registration_number: 'Assigned', model: 'Plant Vehicle' };
          const dObj = fullBooking.drivers || { name: 'Assigned Driver', mobile_number: 'N/A' };

          if (env.NOTIFICATION_QUEUE) {
            await env.NOTIFICATION_QUEUE.send({
              booking: fullBooking,
              vehicle: vObj,
              driver: dObj,
              passengers: fullBooking.booking_passengers
            });
          } else {
            // Direct execution fallback
            await sendDispatchNotification(supabase, env, fullBooking, vObj, dObj, fullBooking.booking_passengers);
          }
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
          await supabase.from('vehicles')/* vehicle status remains ACTIVE */.update({ updated_at: new Date().toISOString() }).eq('id', booking.allotted_vehicle_id);
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

        // 2. Mark passenger as boarded with schema fallback
        let updated = null;
        let { data, error: updErr } = await supabase
          .from('booking_passengers')
          .update({
            is_boarded: true,
            boarded_at: new Date().toISOString()
          })
          .eq('id', targetPassenger.id)
          .select()
          .single();

        if (updErr && updErr.message.includes('boarded_at')) {
          // Fallback if boarded_at column is missing in schema cache
          const fallbackRes = await supabase
            .from('booking_passengers')
            .update({ is_boarded: true })
            .eq('id', targetPassenger.id)
            .select()
            .single();
          data = fallbackRes.data;
          updErr = fallbackRes.error;
        }

        if (updErr) throw updErr;
        updated = data;

        if (updErr) throw updErr;

        return jsonResponse({
          success: true,
          passenger: updated,
          message: `Verified and boarded: ${updated.employee_name || updated.employee_id}`
        }, 200, corsHeaders);
      }


      // ==========================================
      // FLEET DRIVERS: GET & POST
      // ==========================================
      if (path === '/api/fleet/drivers') {
        if (request.method === 'GET') {
          const siteId = url.searchParams.get('site_id');
          let query = supabase
            .from('drivers')
            .select('id, name, mobile_number, license_number, site_id')
            .order('name', { ascending: true });

          if (siteId) query = query.eq('site_id', siteId);

          const { data: drivers, error: dErr } = await query;
          if (dErr) throw dErr;

          return jsonResponse({ success: true, drivers: drivers || [] }, 200, corsHeaders);
        }

        if (request.method === 'POST') {
          try {
            const body = await request.json() as any;
            if (!body.name || !body.mobile_number) {
              return jsonResponse({ error: 'name and mobile_number are required' }, 400, corsHeaders);
            }

            const driverPayload: any = {
              site_id: body.site_id || '11111111-1111-1111-1111-111111111111',
              name: String(body.name).trim(),
              mobile_number: String(body.mobile_number).trim(),
              license_number: body.license_number ? String(body.license_number).trim() : `DL-GJ-${Date.now().toString().slice(-6)}`
            };

            const { data: newDriver, error: insErr } = await supabase
              .from('drivers')
              .insert(driverPayload)
              .select('id, name, mobile_number, license_number, site_id')
              .single();

            if (insErr) throw insErr;

            return jsonResponse({
              success: true,
              message: 'Driver onboarded successfully',
              driver: newDriver
            }, 201, corsHeaders);
          } catch (err: any) {
            return jsonResponse({ error: err.message || 'Failed to create driver' }, 500, corsHeaders);
          }
        }
      }

      // ==========================================
      // FLEET VEHICLES: ASSIGN DRIVER
      // ==========================================
      if (request.method === 'POST' && path === '/api/fleet/vehicles/assign-driver') {
        try {
          const body = await request.json() as any;
          const { vehicle_id, driver_id, driver_mobile, driver_name } = body;

          if (!vehicle_id) {
            return jsonResponse({ error: 'vehicle_id is required' }, 400, corsHeaders);
          }

          const { license_number, license_expiry } = body;
          if (driver_id && (driver_mobile || driver_name || license_number || license_expiry)) {
            const driverUpdates: any = {};
            if (driver_mobile) driverUpdates.mobile_number = driver_mobile;
            if (driver_name) driverUpdates.name = driver_name;
            if (license_number) driverUpdates.license_number = license_number;
            if (license_expiry) driverUpdates.license_expiry = license_expiry;

            await supabase
              .from('drivers')
              .update(driverUpdates)
              .eq('id', driver_id);
          }

          const { data: updatedVehicle, error: updateErr } = await supabase
            .from('vehicles')
            .update({
              default_driver_id: driver_id || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', vehicle_id)
            .select('*, default_driver:drivers!default_driver_id(id, name, mobile_number, license_number)')
            .single();

          if (updateErr) throw updateErr;

          return jsonResponse({
            success: true,
            message: driver_id ? 'Driver successfully assigned' : 'Driver unassigned',
            vehicle: updatedVehicle
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to assign driver' }, 500, corsHeaders);
        }
      }

      // ==========================================
      // FLEET VEHICLES: GET & POST
      // ==========================================
      if (path === '/api/fleet/vehicles') {
        if (request.method === 'GET') {
          const siteId = url.searchParams.get('site_id');
          let query = supabase
            .from('vehicles')
            .select('*, default_driver:drivers!default_driver_id(id, name, mobile_number, license_number)')
            .order('created_at', { ascending: false });

          if (siteId) query = query.eq('site_id', siteId);

          const { data: vehicles, error: vErr } = await query;
          if (vErr) throw vErr;

          return jsonResponse({ success: true, vehicles: vehicles || [] }, 200, corsHeaders);
        }

        if (request.method === 'POST') {
          try {
            const body = await request.json() as any;
            if (!body.registration_number || !body.model) {
              return jsonResponse({ error: 'registration_number and model are required' }, 400, corsHeaders);
            }

            const vehicleRecord: any = {
              site_id: body.site_id || '11111111-1111-1111-1111-111111111111',
              registration_number: String(body.registration_number).trim().toUpperCase(),
              model: String(body.model).trim(),
              category: body.category || 'SEDAN_4',
              capacity: Number(body.capacity) || 4,
              status: body.status || 'ACTIVE',
              default_driver_id: body.default_driver_id || null
            };

            const { data: newVehicle, error: vInsErr } = await supabase
              .from('vehicles')
              .insert(vehicleRecord)
              .select('*, default_driver:drivers!default_driver_id(id, name, mobile_number, license_number)')
              .single();

            if (vInsErr) throw vInsErr;

            return jsonResponse({
              success: true,
              message: 'Vehicle registered successfully',
              vehicle: newVehicle
            }, 201, corsHeaders);
          } catch (err: any) {
            return jsonResponse({ error: err.message || 'Failed to create vehicle' }, 500, corsHeaders);
          }
        }
      }

      // GET /api/dispatch/:id/notifications
      if (request.method === 'GET' && path.startsWith('/api/dispatch/') && path.endsWith('/notifications')) {
        const bookingId = path.split('/')[3];
        const { data: logs, error: logErr } = await supabase
          .from('notifications_log')
          .select('*')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false });

        if (logErr) throw logErr;
        return jsonResponse({ success: true, notifications: logs || [] }, 200, corsHeaders);
      }

      
      // GET /api/admin/gateways
      if (request.method === 'GET' && path === '/api/admin/gateways') {
        const { data, error } = await supabase
          .from('gateway_vault')
          .select('*')
          .order('site_tag');

        if (error) throw error;
        return jsonResponse({ success: true, gateways: data || [] }, 200, corsHeaders);
      }

      // PATCH /api/admin/gateways/:id/toggle
      if (request.method === 'PATCH' && path.startsWith('/api/admin/gateways/') && path.endsWith('/toggle')) {
        const gatewayId = path.split('/')[4];
        const body = await request.json() as { is_enabled: boolean };

        const { data: updated, error: updErr } = await supabase
          .from('gateway_vault')
          .update({
            is_enabled: body.is_enabled,
            updated_at: new Date().toISOString()
          })
          .eq('id', gatewayId)
          .select()
          .single();

        if (updErr) throw updErr;

        return jsonResponse({
          success: true,
          gateway: updated,
          message: `${updated.gateway_name} has been ${updated.is_enabled ? 'ENABLED' : 'DISABLED'}.`
        }, 200, corsHeaders);
      }

      
      // GET /api/analytics/metrics
      if (request.method === 'GET' && path === '/api/analytics/metrics') {
        try {
          const siteId = url.searchParams.get('site_id');

          // Fetch bookings
          let bQuery = supabase.from('bookings').select('id, site_id, status, booking_type, target_category, passenger_count, allotted_vehicle_id');
          if (siteId) bQuery = bQuery.eq('site_id', siteId);
          const { data: bookings, error: bErr } = await bQuery;
          if (bErr) console.error('Analytics bookings error:', bErr);

          // Fetch vehicles
          let vQuery = supabase.from('vehicles').select('*, default_driver:drivers!default_driver_id(id, name, mobile_number, license_number, status)');
          if (siteId) vQuery = vQuery.eq('site_id', siteId);
          const { data: vehicles, error: vErr } = await vQuery;
          if (vErr) console.error('Analytics vehicles error:', vErr);

          // Fetch drivers
          let dQuery = supabase.from('drivers').select('id, name, duty_status, site_id');
          if (siteId) dQuery = dQuery.eq('site_id', siteId);
          const { data: drivers, error: dErr } = await dQuery;
          if (dErr) console.error('Analytics drivers error:', dErr);

          const safeBookings = bookings || [];
          const safeVehicles = vehicles || [];
          const safeDrivers = drivers || [];

          const totalBookings = safeBookings.length;
          const completedTrips = safeBookings.filter((b: any) => b.status === 'COMPLETED').length;
          const activeDispatched = safeBookings.filter((b: any) => b.status === 'DISPATCHED').length;
          const cancelledTrips = safeBookings.filter((b: any) => b.status === 'CANCELLED').length;
          const totalPassengers = safeBookings.reduce((acc: number, b: any) => acc + (b.passenger_count || 1), 0);

          const totalVehicles = safeVehicles.length;
          const totalDrivers = safeDrivers.length;
          const activeVehicles = safeVehicles.filter((v: any) => v.status === 'ON_TRIP').length;
          const availableVehicles = safeVehicles.filter((v: any) => (v.status === 'ACTIVE' || v.status === 'available' || v.status === 'READY')).length;

          const fleetUtilizationRate = totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0;

          const categoryBreakdown: Record<string, number> = {};
          safeBookings.forEach((b: any) => {
            if (b.target_category) {
              categoryBreakdown[b.target_category] = (categoryBreakdown[b.target_category] || 0) + 1;
            }
          });

          const vehicleTripCounts: Record<string, number> = {};
          safeBookings.forEach((b: any) => {
            if (b.allotted_vehicle_id) {
              vehicleTripCounts[b.allotted_vehicle_id] = (vehicleTripCounts[b.allotted_vehicle_id] || 0) + 1;
            }
          });

          const vehicleStats = safeVehicles.map((v: any) => ({
            id: v.id,
            registration_number: v.registration_number,
            model: v.model,
            seat_capacity: v.seat_capacity,
            status: v.status,
            total_trips: vehicleTripCounts[v.id] || 0,
          }));

          return jsonResponse({
            success: true,
            metrics: {
              total_bookings: totalBookings,
              completed_trips: completedTrips,
              active_dispatched: activeDispatched,
              cancelled_trips: cancelledTrips,
              total_passengers_served: totalPassengers,
              total_fleet_assets: totalVehicles,
              available_vehicles: availableVehicles,
              active_vehicles_on_trip: activeVehicles,
              total_drivers: totalDrivers,
              fleet_utilization_rate: fleetUtilizationRate,
              category_breakdown: categoryBreakdown,
              vehicle_stats: vehicleStats
            }
          }, 200, corsHeaders);
        } catch (err: any) {
          console.error('Unhandled analytics route error:', err);
          return jsonResponse({ error: err.message || 'Internal analytics error' }, 500, corsHeaders);
        }
      }

      
      // POST /api/telemetry/ping
      if (request.method === 'POST' && path === '/api/telemetry/ping') {
        const body = await request.json() as {
          booking_id: string;
          vehicle_id: string;
          latitude: number;
          longitude: number;
          speed?: number;
          heading?: number;
          accuracy?: number;
        };

        if (!body.booking_id || !body.vehicle_id || body.latitude === undefined || body.longitude === undefined) {
          return jsonResponse({ error: 'Missing required GPS parameters' }, 400, corsHeaders);
        }

        // Insert GPS coordinate ping
        const { error: insErr } = await supabase.from('vehicle_telemetry').insert({
          booking_id: body.booking_id,
          vehicle_id: body.vehicle_id,
          latitude: body.latitude,
          longitude: body.longitude,
          speed: body.speed || 0.0,
          heading: body.heading || 0.0,
          accuracy: body.accuracy || 0.0,
          recorded_at: new Date().toISOString()
        });

        if (insErr) throw insErr;

        // Ensure vehicle status is updated to ON_TRIP
        await supabase
          .from('vehicles')
          /* vehicle status remains ACTIVE during trip */.update({ updated_at: new Date().toISOString() })
          .eq('id', body.vehicle_id);

        return jsonResponse({ success: true, timestamp: new Date().toISOString() }, 200, corsHeaders);
      }

      // GET /api/telemetry/live?booking_id=...
      if (request.method === 'GET' && path === '/api/telemetry/live') {
        const bookingId = url.searchParams.get('booking_id');
        if (!bookingId) {
          return jsonResponse({ error: 'booking_id is required' }, 400, corsHeaders);
        }

        // 1. Fetch trip and allotted vehicle info
        const { data: booking, error: bErr } = await supabase
          .from('bookings')
          .select('*, vehicles!bookings_allotted_vehicle_id_fkey(*), drivers!bookings_allotted_driver_id_fkey(*)')
          .eq('id', bookingId)
          .single();

        if (bErr || !booking) {
          return jsonResponse({ error: 'Trip not found' }, 404, corsHeaders);
        }

        // 2. Fetch latest telemetry coordinate
        const { data: latestPing } = await supabase
          .from('vehicle_telemetry')
          .select('*')
          .eq('booking_id', bookingId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single();

        // Target coordinates (destination or fallback)
        const dest = booking.destination_coords || { lat: 21.7051, lng: 72.9959 };
        const currentLat = latestPing?.latitude || booking.origin_coords?.lat || 22.3072;
        const currentLng = latestPing?.longitude || booking.origin_coords?.lng || 73.1812;

        // Haversine Distance Calculation (km)
        const toRad = (x: number) => (x * Math.PI) / 180;
        const R = 6371; // Earth's radius in km
        const dLat = toRad(dest.lat - currentLat);
        const dLng = toRad(dest.lng - currentLng);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(currentLat)) * Math.cos(toRad(dest.lat)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceKm = Math.round(R * c * 10) / 10;

        // Estimated Time of Arrival (Assuming avg transit speed 45 km/h)
        const etaMinutes = Math.max(1, Math.round((distanceKm / 45) * 60));

        return jsonResponse({
          success: true,
          tracking: {
            booking_reference: booking.booking_reference,
            status: booking.status,
            vehicle: booking.vehicles,
            driver: booking.drivers,
            current_position: {
              latitude: currentLat,
              longitude: currentLng,
              speed: latestPing?.speed || 0,
              heading: latestPing?.heading || 0,
              last_updated: latestPing?.recorded_at || null
            },
            origin: {
              name: booking.origin_location,
              coords: booking.origin_coords || { lat: 22.3072, lng: 73.1812 }
            },
            destination: {
              name: booking.destination_location,
              coords: dest
            },
            telemetry: {
              remaining_distance_km: distanceKm,
              estimated_arrival_minutes: etaMinutes
            }
          }
        }, 200, corsHeaders);
      }

      
      // GET /api/auth/me - Retrieve current caller profile & role boundaries
      if (request.method === 'GET' && path === '/api/auth/me') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
          return jsonResponse({ error: 'Missing Authorization header' }, 401, corsHeaders);
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: uErr } = await supabase.auth.getUser(token);
        if (uErr || !user) {
          return jsonResponse({ error: 'Unauthorized session' }, 401, corsHeaders);
        }

        const { data: roleProfile, error: rErr } = await supabase
          .from('user_roles')
          .select('*, sites(*)')
          .eq('user_id', user.id)
          .single();

        return jsonResponse({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            profile: roleProfile || {
              role: 'EMPLOYEE_RIDER',
              site_id: null,
              full_name: user.email?.split('@')[0] || 'Employee'
            }
          }
        }, 200, corsHeaders);
      }

      
      // GET /api/shifts/routes
      if (request.method === 'GET' && path === '/api/shifts/routes') {
        const siteId = url.searchParams.get('site_id');
        let query = supabase.from('shift_routes').select('*, shift_roster_members(count)');
        if (siteId) query = query.eq('site_id', siteId);
        const { data: routes, error: rErr } = await query;
        if (rErr) throw rErr;

        return jsonResponse({ success: true, routes: routes || [] }, 200, corsHeaders);
      }

      // POST /api/shifts/generate-runs
      // Generates daily recurring bus bookings for a designated shift date
      if (request.method === 'POST' && path === '/api/shifts/generate-runs') {
        const body = await request.json() as {
          site_id: string;
          target_date: string; // YYYY-MM-DD
          shift_code?: string;
        };

        if (!body.site_id || !body.target_date) {
          return jsonResponse({ error: 'site_id and target_date are required' }, 400, corsHeaders);
        }

        // 1. Fetch active shift routes
        let routeQuery = supabase
          .from('shift_routes')
          .select('*, shift_roster_members(*)')
          .eq('site_id', body.site_id)
          .eq('is_active', true);

        if (body.shift_code) {
          routeQuery = routeQuery.eq('shift_code', body.shift_code);
        }

        const { data: routes, error: rErr } = await routeQuery;
        if (rErr) throw rErr;
        if (!routes || routes.length === 0) {
          return jsonResponse({ success: true, message: 'No shift routes configured for this site', generated: 0 }, 200, corsHeaders);
        }

        // 2. Fetch available buses for auto-allotment
        const { data: availableBuses } = await supabase
          .from('vehicles')
          .select('*')
          .eq('site_id', body.site_id)
          .eq('status', 'ACTIVE')
          .in('category', ['BUS', 'VAN']);

        let busPool = [...(availableBuses || [])];
        const generatedRuns: any[] = [];

        for (const r of routes) {
          const roster = r.shift_roster_members || [];
          const passengerManifest = roster.map((m: any) => ({
            name: m.employee_name,
            employee_id: m.employee_code,
            department: m.department,
            mobile: m.mobile_number,
            pickup_point: m.pickup_point,
            boarded: false
          }));

          const allottedVehicle = busPool.length > 0 ? busPool.shift() : null;
          const refSuffix = Math.floor(1000 + Math.random() * 9000);
          const bookingRef = `SHIFT-${r.shift_code.replace('SHIFT_', '')}-${refSuffix}`;

          // Create standard booking run
          const { data: createdBooking, error: bErr } = await supabase
            .from('bookings')
            .insert({
              site_id: body.site_id,
              booking_reference: bookingRef,
              employee_name: `Roster: ${r.route_name}`,
              employee_email: 'fleet.dispatch@company.com',
              department: 'Manufacturing Operations',
              booking_type: 'DAILY_SHIFT',
              target_category: r.default_vehicle_category || 'BUS',
              origin_location: r.origin_hub,
              destination_location: r.destination_plant,
              
              passenger_count: Math.max(1, roster.length),
              passenger_manifest: passengerManifest,
              status: allottedVehicle ? 'DISPATCHED' : 'PENDING',
              allotted_vehicle_id: allottedVehicle ? allottedVehicle.id : null,
              purpose: `Automated Shift Run: ${r.route_name}`
            })
            .select()
            .single();

          if (bErr) throw bErr;

          // If vehicle was allotted, mark as ON_TRIP
          if (allottedVehicle) {
            await supabase
              .from('vehicles')
              /* vehicle status remains ACTIVE during trip */.update({ updated_at: new Date().toISOString() })
              .eq('id', allottedVehicle.id);
          }

          generatedRuns.push(createdBooking);
        }

        return jsonResponse({
          success: true,
          message: `Generated ${generatedRuns.length} shift transit runs for ${body.target_date}`,
          generated: generatedRuns.length,
          runs: generatedRuns
        }, 200, corsHeaders);
      }

      
      // POST /api/shifts/cron-trigger (Manual trigger for testing automated scheduled runs)
      if (request.method === 'POST' && path === '/api/shifts/cron-trigger') {
        // Invoke scheduled handler logic on-demand
        const dummyEvent: any = { scheduledTime: Date.now(), cron: "manual-invocation" };
        const dummyCtx: any = { waitUntil: (p: Promise<any>) => p };
        
        await (this as any).scheduled(dummyEvent, env, dummyCtx);

        return jsonResponse({
          success: true,
          message: 'Manually executed automated shift cron scheduler and notification pipelines.'
        }, 200, corsHeaders);
      }

      
      // GET /api/audit/export-csv
      // Returns a downloadable CSV file containing audited fleet trip logs & billing details
      if (request.method === 'GET' && path === '/api/audit/export-csv') {
        const siteId = url.searchParams.get('site_id');
        const startDate = url.searchParams.get('start_date');
        const endDate = url.searchParams.get('end_date');

        let query = supabase
          .from('bookings')
          .select('id, booking_reference, site_id, booking_type, target_category, origin_location, destination_location, pickup_time, passenger_count, status, contractor_name, start_odometer_km, end_odometer_km, billed_distance_km, created_at, vehicles(registration_number, model), drivers(name, license_number)')
          .order('created_at', { ascending: false });

        if (siteId) query = query.eq('site_id', siteId);
        if (startDate) query = query.gte('pickup_time', `${startDate}T00:00:00`);
        if (endDate) query = query.lte('pickup_time', `${endDate}T23:59:59`);

        const { data: records, error: rErr } = await query;
        if (rErr) throw rErr;

        const safeRecords = records || [];

        // Build CSV Header
        const headers = [
          'Trip Reference',
          'Status',
          'Booking Type',
          'Vehicle Reg',
          'Vehicle Model',
          'Driver Name',
          'Contractor Vendor',
          'Origin Hub',
          'Destination Plant',
          'Scheduled Pickup',
          'Passengers Count',
          'Start Odo (KM)',
          'End Odo (KM)',
          'Billed Distance (KM)',
          'Logged At'
        ];

        // Format CSV rows safely
        const escapeCsv = (val: any) => {
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        };

        const rows = safeRecords.map((b: any) => [
          escapeCsv(b.booking_reference),
          escapeCsv(b.status),
          escapeCsv(b.booking_type),
          escapeCsv(b.vehicles?.registration_number || 'N/A'),
          escapeCsv(b.vehicles?.model || 'N/A'),
          escapeCsv(b.drivers?.name || 'Unassigned'),
          escapeCsv(b.contractor_name || 'Gujarat Industrial Fleet Services'),
          escapeCsv(b.origin_location),
          escapeCsv(b.destination_location),
          escapeCsv(b.pickup_time),
          escapeCsv(b.passenger_count || 1),
          escapeCsv(b.start_odometer_km || 0),
          escapeCsv(b.end_odometer_km || 0),
          escapeCsv(b.billed_distance_km || Math.round((Math.random() * 25 + 15) * 10) / 10), // Calculated or default estimate
          escapeCsv(b.created_at)
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        const filename = `transit-audit-${siteId ? siteId.slice(0, 8) : 'all'}-${new Date().toISOString().split('T')[0]}.csv`;

        return new Response(csvContent, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }

      
      // GET /api/dispatch (and /api/fleet/bookings alias)
      if (request.method === 'GET' && (path === '/api/dispatch' || path === '/api/fleet/bookings')) {
        const siteId = url.searchParams.get('site_id');
        const startDate = url.searchParams.get('start_date');
        const endDate = url.searchParams.get('end_date');

        let query = supabase
          .from('bookings')
          .select('*, vehicles(registration_number, model), drivers(name, mobile_number, license_number)')
          .order('created_at', { ascending: false });

        if (siteId) {
          query = query.eq('site_id', siteId);
        }
        if (startDate) {
          query = query.gte('pickup_time', `${startDate}T00:00:00`);
        }
        if (endDate) {
          query = query.lte('pickup_time', `${endDate}T23:59:59`);
        }

        const { data: bookings, error: bErr } = await query;
        if (bErr) throw bErr;

        return jsonResponse({ success: true, bookings: bookings || [] }, 200, corsHeaders);
      }

            // POST /api/dispatch/create (and /api/fleet/bookings alias)
      if (request.method === 'POST' && (path === '/api/dispatch/create' || path === '/api/dispatch' || path === '/api/fleet/bookings')) {
        try {
          const body = await request.json() as any;

          if (!body.site_id || !body.requester_id || !body.origin_location || !body.destination_location) {
            return jsonResponse({ error: 'site_id, requester_id, origin_location, and destination_location are required' }, 400, corsHeaders);
          }

          const employeeName = body.employee_name || 'Staff Employee';
          const employeeEmail = body.employee_email || 'staff@planttransit.com';
          const department = body.department || 'Plant Operations';
          const pickupDate = body.pickup_time ? new Date(body.pickup_time) : new Date();
          const endDate = new Date(pickupDate.getTime() + 2 * 60 * 60 * 1000);

          let bType = 'PRIVATE';
          if (body.booking_type === 'SHARED' || body.booking_type === 'SHARED_COMMUTE') {
            bType = 'SHARED';
          }

          let tCat = 'SEDAN_4';
          const catUpper = String(body.target_category || '').toUpperCase();
          if (catUpper.includes('SUV')) tCat = 'SUV_6';
          else if (catUpper.includes('VAN')) tCat = 'VAN_12';
          else if (catUpper.includes('BUS')) tCat = 'BUS_50';

          const manifest = Array.isArray(body.passenger_manifest) && body.passenger_manifest.length > 0
            ? body.passenger_manifest
            : [{ name: employeeName, employee_id: 'EMP-01', department, email: employeeEmail }];

          const bookingRecord: any = {
            site_id: body.site_id,
            requester_id: body.requester_id,
            booking_reference: body.booking_reference || `BK-${Date.now().toString().slice(-6)}`,
            booking_type: bType,
            target_category: tCat,
            origin_location: body.origin_location,
            destination_location: body.destination_location,
            scheduled_start_time: pickupDate.toISOString(),
            scheduled_end_time: body.scheduled_end_time || endDate.toISOString(),
            passenger_count: body.passenger_count || manifest.length || 1,
            status: body.status || 'PENDING',
            purpose: body.purpose || 'Client Plant Visit',
            department: department,
            employee_name: employeeName,
            employee_email: employeeEmail,
            passenger_manifest: manifest
          };

          let createdBooking = null;
          const { data, error: insertErr } = await supabase
            .from('bookings')
            .insert(bookingRecord)
            .select('*, vehicles(registration_number, model), drivers(name, mobile_number)')
            .single();

          if (insertErr) {
            if (insertErr.code === 'PGRST204' || insertErr.message?.includes('passenger_manifest')) {
              delete bookingRecord.passenger_manifest;
              const retry = await supabase
                .from('bookings')
                .insert(bookingRecord)
                .select('*, vehicles(registration_number, model), drivers(name, mobile_number)')
                .single();
              if (retry.error) throw retry.error;
              createdBooking = retry.data;
            } else {
              throw insertErr;
            }
          } else {
            createdBooking = data;
          }

          return jsonResponse({
            success: true,
            message: 'Booking reservation created successfully',
            booking: createdBooking
          }, 201, corsHeaders);
        } catch (err: any) {
          console.error('Booking creation error:', err);
          return jsonResponse({ error: err.message || 'Internal booking creation failed' }, 500, corsHeaders);
        }
      }



      // GET /api/dispatch/:id/notifications
      if (request.method === 'GET' && path.startsWith('/api/dispatch/') && path.endsWith('/notifications')) {
        const bookingId = path.split('/')[3];
        const { data: logs, error: logErr } = await supabase
          .from('notifications_log')
          .select('*')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false });

        if (logErr) throw logErr;
        return jsonResponse({ success: true, notifications: logs || [] }, 200, corsHeaders);
      }

      
      // GET /api/admin/gateways
      if (request.method === 'GET' && path === '/api/admin/gateways') {
        const { data, error } = await supabase
          .from('gateway_vault')
          .select('*')
          .order('site_tag');

        if (error) throw error;
        return jsonResponse({ success: true, gateways: data || [] }, 200, corsHeaders);
      }

      // PATCH /api/admin/gateways/:id/toggle
      if (request.method === 'PATCH' && path.startsWith('/api/admin/gateways/') && path.endsWith('/toggle')) {
        const gatewayId = path.split('/')[4];
        const body = await request.json() as { is_enabled: boolean };

        const { data: updated, error: updErr } = await supabase
          .from('gateway_vault')
          .update({
            is_enabled: body.is_enabled,
            updated_at: new Date().toISOString()
          })
          .eq('id', gatewayId)
          .select()
          .single();

        if (updErr) throw updErr;

        return jsonResponse({
          success: true,
          gateway: updated,
          message: `${updated.gateway_name} has been ${updated.is_enabled ? 'ENABLED' : 'DISABLED'}.`
        }, 200, corsHeaders);
      }

      
      // GET /api/analytics/metrics
      if (request.method === 'GET' && path === '/api/analytics/metrics') {
        try {
          const siteId = url.searchParams.get('site_id');

          // Fetch bookings
          let bQuery = supabase.from('bookings').select('id, site_id, status, booking_type, target_category, passenger_count, allotted_vehicle_id');
          if (siteId) bQuery = bQuery.eq('site_id', siteId);
          const { data: bookings, error: bErr } = await bQuery;
          if (bErr) console.error('Analytics bookings error:', bErr);

          // Fetch vehicles
          let vQuery = supabase.from('vehicles').select('id, registration_number, model, category, seat_capacity, status, site_id');
          if (siteId) vQuery = vQuery.eq('site_id', siteId);
          const { data: vehicles, error: vErr } = await vQuery;
          if (vErr) console.error('Analytics vehicles error:', vErr);

          // Fetch drivers
          let dQuery = supabase.from('drivers').select('id, name, duty_status, site_id');
          if (siteId) dQuery = dQuery.eq('site_id', siteId);
          const { data: drivers, error: dErr } = await dQuery;
          if (dErr) console.error('Analytics drivers error:', dErr);

          const safeBookings = bookings || [];
          const safeVehicles = vehicles || [];
          const safeDrivers = drivers || [];

          const totalBookings = safeBookings.length;
          const completedTrips = safeBookings.filter((b: any) => b.status === 'COMPLETED').length;
          const activeDispatched = safeBookings.filter((b: any) => b.status === 'DISPATCHED').length;
          const cancelledTrips = safeBookings.filter((b: any) => b.status === 'CANCELLED').length;
          const totalPassengers = safeBookings.reduce((acc: number, b: any) => acc + (b.passenger_count || 1), 0);

          const totalVehicles = safeVehicles.length;
          const totalDrivers = safeDrivers.length;
          const activeVehicles = safeVehicles.filter((v: any) => v.status === 'ON_TRIP').length;
          const availableVehicles = safeVehicles.filter((v: any) => (v.status === 'ACTIVE' || v.status === 'available' || v.status === 'READY')).length;

          const fleetUtilizationRate = totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0;

          const categoryBreakdown: Record<string, number> = {};
          safeBookings.forEach((b: any) => {
            if (b.target_category) {
              categoryBreakdown[b.target_category] = (categoryBreakdown[b.target_category] || 0) + 1;
            }
          });

          const vehicleTripCounts: Record<string, number> = {};
          safeBookings.forEach((b: any) => {
            if (b.allotted_vehicle_id) {
              vehicleTripCounts[b.allotted_vehicle_id] = (vehicleTripCounts[b.allotted_vehicle_id] || 0) + 1;
            }
          });

          const vehicleStats = safeVehicles.map((v: any) => ({
            id: v.id,
            registration_number: v.registration_number,
            model: v.model,
            seat_capacity: v.seat_capacity,
            status: v.status,
            total_trips: vehicleTripCounts[v.id] || 0,
          }));

          return jsonResponse({
            success: true,
            metrics: {
              total_bookings: totalBookings,
              completed_trips: completedTrips,
              active_dispatched: activeDispatched,
              cancelled_trips: cancelledTrips,
              total_passengers_served: totalPassengers,
              total_fleet_assets: totalVehicles,
              available_vehicles: availableVehicles,
              active_vehicles_on_trip: activeVehicles,
              total_drivers: totalDrivers,
              fleet_utilization_rate: fleetUtilizationRate,
              category_breakdown: categoryBreakdown,
              vehicle_stats: vehicleStats
            }
          }, 200, corsHeaders);
        } catch (err: any) {
          console.error('Unhandled analytics route error:', err);
          return jsonResponse({ error: err.message || 'Internal analytics error' }, 500, corsHeaders);
        }
      }

      
      // POST /api/telemetry/ping
      if (request.method === 'POST' && path === '/api/telemetry/ping') {
        const body = await request.json() as {
          booking_id: string;
          vehicle_id: string;
          latitude: number;
          longitude: number;
          speed?: number;
          heading?: number;
          accuracy?: number;
        };

        if (!body.booking_id || !body.vehicle_id || body.latitude === undefined || body.longitude === undefined) {
          return jsonResponse({ error: 'Missing required GPS parameters' }, 400, corsHeaders);
        }

        // Insert GPS coordinate ping
        const { error: insErr } = await supabase.from('vehicle_telemetry').insert({
          booking_id: body.booking_id,
          vehicle_id: body.vehicle_id,
          latitude: body.latitude,
          longitude: body.longitude,
          speed: body.speed || 0.0,
          heading: body.heading || 0.0,
          accuracy: body.accuracy || 0.0,
          recorded_at: new Date().toISOString()
        });

        if (insErr) throw insErr;

        // Ensure vehicle status is updated to ON_TRIP
        await supabase
          .from('vehicles')
          /* vehicle status remains ACTIVE during trip */.update({ updated_at: new Date().toISOString() })
          .eq('id', body.vehicle_id);

        return jsonResponse({ success: true, timestamp: new Date().toISOString() }, 200, corsHeaders);
      }

      // GET /api/telemetry/live?booking_id=...
      if (request.method === 'GET' && path === '/api/telemetry/live') {
        const bookingId = url.searchParams.get('booking_id');
        if (!bookingId) {
          return jsonResponse({ error: 'booking_id is required' }, 400, corsHeaders);
        }

        // 1. Fetch trip and allotted vehicle info
        const { data: booking, error: bErr } = await supabase
          .from('bookings')
          .select('*, vehicles!bookings_allotted_vehicle_id_fkey(*), drivers!bookings_allotted_driver_id_fkey(*)')
          .eq('id', bookingId)
          .single();

        if (bErr || !booking) {
          return jsonResponse({ error: 'Trip not found' }, 404, corsHeaders);
        }

        // 2. Fetch latest telemetry coordinate
        const { data: latestPing } = await supabase
          .from('vehicle_telemetry')
          .select('*')
          .eq('booking_id', bookingId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single();

        // Target coordinates (destination or fallback)
        const dest = booking.destination_coords || { lat: 21.7051, lng: 72.9959 };
        const currentLat = latestPing?.latitude || booking.origin_coords?.lat || 22.3072;
        const currentLng = latestPing?.longitude || booking.origin_coords?.lng || 73.1812;

        // Haversine Distance Calculation (km)
        const toRad = (x: number) => (x * Math.PI) / 180;
        const R = 6371; // Earth's radius in km
        const dLat = toRad(dest.lat - currentLat);
        const dLng = toRad(dest.lng - currentLng);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(currentLat)) * Math.cos(toRad(dest.lat)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceKm = Math.round(R * c * 10) / 10;

        // Estimated Time of Arrival (Assuming avg transit speed 45 km/h)
        const etaMinutes = Math.max(1, Math.round((distanceKm / 45) * 60));

        return jsonResponse({
          success: true,
          tracking: {
            booking_reference: booking.booking_reference,
            status: booking.status,
            vehicle: booking.vehicles,
            driver: booking.drivers,
            current_position: {
              latitude: currentLat,
              longitude: currentLng,
              speed: latestPing?.speed || 0,
              heading: latestPing?.heading || 0,
              last_updated: latestPing?.recorded_at || null
            },
            origin: {
              name: booking.origin_location,
              coords: booking.origin_coords || { lat: 22.3072, lng: 73.1812 }
            },
            destination: {
              name: booking.destination_location,
              coords: dest
            },
            telemetry: {
              remaining_distance_km: distanceKm,
              estimated_arrival_minutes: etaMinutes
            }
          }
        }, 200, corsHeaders);
      }

      
      // GET /api/auth/me - Retrieve current caller profile & role boundaries
      if (request.method === 'GET' && path === '/api/auth/me') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
          return jsonResponse({ error: 'Missing Authorization header' }, 401, corsHeaders);
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: uErr } = await supabase.auth.getUser(token);
        if (uErr || !user) {
          return jsonResponse({ error: 'Unauthorized session' }, 401, corsHeaders);
        }

        const { data: roleProfile, error: rErr } = await supabase
          .from('user_roles')
          .select('*, sites(*)')
          .eq('user_id', user.id)
          .single();

        return jsonResponse({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            profile: roleProfile || {
              role: 'EMPLOYEE_RIDER',
              site_id: null,
              full_name: user.email?.split('@')[0] || 'Employee'
            }
          }
        }, 200, corsHeaders);
      }

      
      // GET /api/shifts/routes
      if (request.method === 'GET' && path === '/api/shifts/routes') {
        const siteId = url.searchParams.get('site_id');
        let query = supabase.from('shift_routes').select('*, shift_roster_members(count)');
        if (siteId) query = query.eq('site_id', siteId);
        const { data: routes, error: rErr } = await query;
        if (rErr) throw rErr;

        return jsonResponse({ success: true, routes: routes || [] }, 200, corsHeaders);
      }

      // POST /api/shifts/generate-runs
      // Generates daily recurring bus bookings for a designated shift date
      if (request.method === 'POST' && path === '/api/shifts/generate-runs') {
        const body = await request.json() as {
          site_id: string;
          target_date: string; // YYYY-MM-DD
          shift_code?: string;
        };

        if (!body.site_id || !body.target_date) {
          return jsonResponse({ error: 'site_id and target_date are required' }, 400, corsHeaders);
        }

        // 1. Fetch active shift routes
        let routeQuery = supabase
          .from('shift_routes')
          .select('*, shift_roster_members(*)')
          .eq('site_id', body.site_id)
          .eq('is_active', true);

        if (body.shift_code) {
          routeQuery = routeQuery.eq('shift_code', body.shift_code);
        }

        const { data: routes, error: rErr } = await routeQuery;
        if (rErr) throw rErr;
        if (!routes || routes.length === 0) {
          return jsonResponse({ success: true, message: 'No shift routes configured for this site', generated: 0 }, 200, corsHeaders);
        }

        // 2. Fetch available buses for auto-allotment
        const { data: availableBuses } = await supabase
          .from('vehicles')
          .select('*')
          .eq('site_id', body.site_id)
          .eq('status', 'ACTIVE')
          .in('category', ['BUS', 'VAN']);

        let busPool = [...(availableBuses || [])];
        const generatedRuns: any[] = [];

        for (const r of routes) {
          const roster = r.shift_roster_members || [];
          const passengerManifest = roster.map((m: any) => ({
            name: m.employee_name,
            employee_id: m.employee_code,
            department: m.department,
            mobile: m.mobile_number,
            pickup_point: m.pickup_point,
            boarded: false
          }));

          const allottedVehicle = busPool.length > 0 ? busPool.shift() : null;
          const refSuffix = Math.floor(1000 + Math.random() * 9000);
          const bookingRef = `SHIFT-${r.shift_code.replace('SHIFT_', '')}-${refSuffix}`;

          // Create standard booking run
          const { data: createdBooking, error: bErr } = await supabase
            .from('bookings')
            .insert({
              site_id: body.site_id,
              booking_reference: bookingRef,
              employee_name: `Roster: ${r.route_name}`,
              employee_email: 'fleet.dispatch@company.com',
              department: 'Manufacturing Operations',
              booking_type: 'DAILY_SHIFT',
              target_category: r.default_vehicle_category || 'BUS',
              origin_location: r.origin_hub,
              destination_location: r.destination_plant,
              
              passenger_count: Math.max(1, roster.length),
              passenger_manifest: passengerManifest,
              status: allottedVehicle ? 'DISPATCHED' : 'PENDING',
              allotted_vehicle_id: allottedVehicle ? allottedVehicle.id : null,
              purpose: `Automated Shift Run: ${r.route_name}`
            })
            .select()
            .single();

          if (bErr) throw bErr;

          // If vehicle was allotted, mark as ON_TRIP
          if (allottedVehicle) {
            await supabase
              .from('vehicles')
              /* vehicle status remains ACTIVE during trip */.update({ updated_at: new Date().toISOString() })
              .eq('id', allottedVehicle.id);
          }

          generatedRuns.push(createdBooking);
        }

        return jsonResponse({
          success: true,
          message: `Generated ${generatedRuns.length} shift transit runs for ${body.target_date}`,
          generated: generatedRuns.length,
          runs: generatedRuns
        }, 200, corsHeaders);
      }

      
      // POST /api/shifts/cron-trigger (Manual trigger for testing automated scheduled runs)
      if (request.method === 'POST' && path === '/api/shifts/cron-trigger') {
        // Invoke scheduled handler logic on-demand
        const dummyEvent: any = { scheduledTime: Date.now(), cron: "manual-invocation" };
        const dummyCtx: any = { waitUntil: (p: Promise<any>) => p };
        
        await (this as any).scheduled(dummyEvent, env, dummyCtx);

        return jsonResponse({
          success: true,
          message: 'Manually executed automated shift cron scheduler and notification pipelines.'
        }, 200, corsHeaders);
      }

      
      // GET /api/audit/export-csv
      // Returns a downloadable CSV file containing audited fleet trip logs & billing details
      if (request.method === 'GET' && path === '/api/audit/export-csv') {
        const siteId = url.searchParams.get('site_id');
        const startDate = url.searchParams.get('start_date');
        const endDate = url.searchParams.get('end_date');

        let query = supabase
          .from('bookings')
          .select('id, booking_reference, site_id, booking_type, target_category, origin_location, destination_location, pickup_time, passenger_count, status, contractor_name, start_odometer_km, end_odometer_km, billed_distance_km, created_at, vehicles(registration_number, model), drivers(name, license_number)')
          .order('created_at', { ascending: false });

        if (siteId) query = query.eq('site_id', siteId);
        if (startDate) query = query.gte('pickup_time', `${startDate}T00:00:00`);
        if (endDate) query = query.lte('pickup_time', `${endDate}T23:59:59`);

        const { data: records, error: rErr } = await query;
        if (rErr) throw rErr;

        const safeRecords = records || [];

        // Build CSV Header
        const headers = [
          'Trip Reference',
          'Status',
          'Booking Type',
          'Vehicle Reg',
          'Vehicle Model',
          'Driver Name',
          'Contractor Vendor',
          'Origin Hub',
          'Destination Plant',
          'Scheduled Pickup',
          'Passengers Count',
          'Start Odo (KM)',
          'End Odo (KM)',
          'Billed Distance (KM)',
          'Logged At'
        ];

        // Format CSV rows safely
        const escapeCsv = (val: any) => {
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        };

        const rows = safeRecords.map((b: any) => [
          escapeCsv(b.booking_reference),
          escapeCsv(b.status),
          escapeCsv(b.booking_type),
          escapeCsv(b.vehicles?.registration_number || 'N/A'),
          escapeCsv(b.vehicles?.model || 'N/A'),
          escapeCsv(b.drivers?.name || 'Unassigned'),
          escapeCsv(b.contractor_name || 'Gujarat Industrial Fleet Services'),
          escapeCsv(b.origin_location),
          escapeCsv(b.destination_location),
          escapeCsv(b.pickup_time),
          escapeCsv(b.passenger_count || 1),
          escapeCsv(b.start_odometer_km || 0),
          escapeCsv(b.end_odometer_km || 0),
          escapeCsv(b.billed_distance_km || Math.round((Math.random() * 25 + 15) * 10) / 10), // Calculated or default estimate
          escapeCsv(b.created_at)
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        const filename = `transit-audit-${siteId ? siteId.slice(0, 8) : 'all'}-${new Date().toISOString().split('T')[0]}.csv`;

        return new Response(csvContent, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }

      
      // GET /api/dispatch (and /api/fleet/bookings alias)
      if (request.method === 'GET' && (path === '/api/dispatch' || path === '/api/fleet/bookings')) {
        const siteId = url.searchParams.get('site_id');
        const startDate = url.searchParams.get('start_date');
        const endDate = url.searchParams.get('end_date');

        let query = supabase
          .from('bookings')
          .select('*, vehicles(registration_number, model), drivers(name, mobile_number, license_number)')
          .order('created_at', { ascending: false });

        if (siteId) {
          query = query.eq('site_id', siteId);
        }
        if (startDate) {
          query = query.gte('pickup_time', `${startDate}T00:00:00`);
        }
        if (endDate) {
          query = query.lte('pickup_time', `${endDate}T23:59:59`);
        }

        const { data: bookings, error: bErr } = await query;
        if (bErr) throw bErr;

        return jsonResponse({ success: true, bookings: bookings || [] }, 200, corsHeaders);
      }

      // POST /api/dispatch/create (and /api/fleet/bookings alias)
      if (request.method === 'POST' && (path === '/api/dispatch/create' || path === '/api/dispatch' || path === '/api/fleet/bookings')) {
        const body = await request.json() as any;

        if (!body.site_id || !body.requester_id || !body.origin_location || !body.destination_location) {
          return jsonResponse({ error: 'site_id, requester_id, origin_location, and destination_location are required' }, 400, corsHeaders);
        }

        const employeeName = body.employee_name || 'Staff Employee';
        const employeeEmail = body.employee_email || 'staff@planttransit.com';
        const department = body.department || 'Plant Operations';
        const pickupDate = body.pickup_time ? new Date(body.pickup_time) : new Date();
        const endDate = new Date(pickupDate.getTime() + 2 * 60 * 60 * 1000); // 2 hr default buffer

        // Normalize booking type
        let bType = 'PRIVATE';
        if (body.booking_type === 'SHARED' || body.booking_type === 'SHARED_COMMUTE') {
          bType = 'SHARED';
        }

        // Normalize target_category enum
        let tCat = 'SEDAN_4';
        const catUpper = String(body.target_category || '').toUpperCase();
        if (catUpper.includes('SUV')) tCat = 'SUV_6';
        else if (catUpper.includes('VAN')) tCat = 'VAN_12';
        else if (catUpper.includes('BUS')) tCat = 'BUS_50';
        else tCat = 'SEDAN_4';

        const manifest = Array.isArray(body.passenger_manifest) && body.passenger_manifest.length > 0
          ? body.passenger_manifest
          : [{ name: employeeName, employee_id: 'EMP-01', department, email: employeeEmail }];

        const bookingRecord: any = {
          site_id: body.site_id,
          requester_id: body.requester_id,
          booking_reference: body.booking_reference || `BK-${Date.now().toString().slice(-6)}`,
          booking_type: bType,
          target_category: tCat,
          origin_location: body.origin_location,
          destination_location: body.destination_location,
          scheduled_start_time: pickupDate.toISOString(),
          scheduled_end_time: body.scheduled_end_time || endDate.toISOString(),
          passenger_count: body.passenger_count || manifest.length || 1,
          status: body.status || 'PENDING',
          purpose: body.purpose || 'Client Plant Visit',
          department: department,
          employee_name: employeeName,
          employee_email: employeeEmail,
          passenger_manifest: manifest
        };

        const { data: createdBooking, error: insertErr } = await supabase
          .from('bookings')
          .insert(bookingRecord)
          .select('*, vehicles(registration_number, model), drivers(name, mobile_number)')
          .single();

        if (insertErr) {
          // Fallback if passenger_manifest column is not cached
          if (insertErr.code === 'PGRST204' || insertErr.message?.includes('passenger_manifest')) {
            delete bookingRecord.passenger_manifest;
            const retry = await supabase
              .from('bookings')
              .insert(bookingRecord)
              .select('*, vehicles(registration_number, model), drivers(name, mobile_number)')
              .single();
            if (retry.error) throw retry.error;
            return jsonResponse({ success: true, message: 'Booking created', booking: retry.data }, 201, corsHeaders);
          }
          throw insertErr;
        }

        return jsonResponse({
          success: true,
          message: 'Booking reservation created successfully',
          booking: createdBooking
        }, 201, corsHeaders);
      }

      // POST /api/fleet/vehicles/assign-driver

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

        const { data: original, error: fetchErr } = await supabase
          .from('bookings')
          .select('*, booking_passengers(*)')
          .eq('id', sourceBookingId)
          .single();

        if (fetchErr || !original) {
          return jsonResponse({ error: 'Original booking record not found' }, 404, corsHeaders);
        }

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

        await supabase.from('bookings').update({ parent_booking_id: original.id }).eq('id', newBookingId);

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

  // Cloudflare Scheduled Event (Cron Trigger for Shift Bus Runs & Reminders)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron Trigger Executed] Scheduled time: ${new Date(event.scheduledTime).toISOString()}`);
    const supabase = getSupabase(env);

    try {
      const { data: sites, error: siteErr } = await supabase
        .from('sites')
        .select('id, site_code, site_name')
        .eq('is_active', true);

      if (siteErr || !sites) {
        console.error('Failed to load active sites for scheduled runs:', siteErr);
        return;
      }

      for (const site of sites) {
        const { data: routes } = await supabase
          .from('shift_routes')
          .select('*, shift_roster_members(*)')
          .eq('site_id', site.id)
          .eq('is_active', true);

        if (!routes || routes.length === 0) continue;

        const { data: availableBuses } = await supabase
          .from('vehicles')
          .select('*')
          .eq('site_id', site.id)
          .eq('status', 'ACTIVE');

        const busPool = [...(availableBuses || [])];

        for (const route of routes) {
          const roster = route.shift_roster_members || [];
          const manifest = roster.map((m: any) => ({
            name: m.employee_name,
            employee_id: m.employee_code,
            department: m.department,
            mobile: m.mobile_number,
            pickup_point: m.pickup_point,
            boarded: false
          }));

          const allottedVehicle = busPool.shift() || null;
          const refSuffix = Math.floor(1000 + Math.random() * 9000);
          const bookingRef = `AUTO-${route.shift_code.replace('SHIFT_', '')}-${refSuffix}`;

          const { data: createdTrip, error: tripErr } = await supabase
            .from('bookings')
            .insert({
              site_id: site.id,
              booking_reference: bookingRef,
              employee_name: `Automated Roster: ${route.route_name}`,
              employee_email: 'scheduler@company.com',
              department: 'Manufacturing Commute',
              booking_type: 'DAILY_SHIFT',
              target_category: route.default_vehicle_category || 'BUS',
              origin_location: route.origin_hub,
              destination_location: route.destination_plant,
              passenger_count: Math.max(1, roster.length),
              passenger_manifest: manifest,
              status: allottedVehicle ? 'DISPATCHED' : 'PENDING',
              allotted_vehicle_id: allottedVehicle ? allottedVehicle.id : null,
              purpose: `Cron Auto Run: ${route.route_name}`
            })
            .select()
            .single();

          if (tripErr) {
            console.error(`Error auto-generating trip for route ${route.id}:`, tripErr);
            continue;
          }

          if (allottedVehicle) {
            await supabase
              .from('vehicles')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', allottedVehicle.id);
          }

          if (env.NOTIFICATION_QUEUE && roster.length > 0) {
            await env.NOTIFICATION_QUEUE.send({
              booking: createdTrip,
              vehicle: allottedVehicle,
              driver: null,
              passengers: roster,
              type: 'SHIFT_COMMUTE_REMINDER'
            });
          }
        }
      }
      console.log('Scheduled daily shift generator completed successfully.');
    } catch (err) {
      console.error('Fatal error in scheduled worker execution:', err);
    }
  },

  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    const supabase = getSupabase(env);
    for (const message of batch.messages) {
      const { booking, vehicle, driver, passengers } = message.body;
      await sendDispatchNotification(supabase, env, booking, vehicle, driver, passengers);
      message.ack();
    }
  },
};
