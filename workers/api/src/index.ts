
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
          const availableVehicles = safeVehicles.filter((v: any) => v.status === 'AVAILABLE').length;

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
          const availableVehicles = safeVehicles.filter((v: any) => v.status === 'AVAILABLE').length;

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

  // Cloudflare Queue Consumer for dispatch notifications
  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    for (const message of batch.messages) {
      const { booking, vehicle, driver, passengers } = message.body;
      await sendDispatchNotification(supabase, env, booking, vehicle, driver, passengers);
      message.ack();
    }
  },
};
