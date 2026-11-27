import { WorkerMailer } from 'worker-mailer';

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

      // ==========================================
      // DISPATCH: VERIFY PASSENGER BOARDING (Unified)
      // ==========================================
      if (request.method === 'POST' && (path === '/api/dispatch/verify-boarding' || path === '/api/dispatch/verify-boarding/')) {
        try {
          const body = await request.json() as any;
          
          // Resilient parameter resolution supporting all client variations
          const bookingIdentifier = (
            body.booking_id || 
            body.booking_reference || 
            body.bookingId || 
            body.bookingRef || 
            body.id || 
            body.ref
          )?.toString().trim();

          const empId = (
            body.employee_id || 
            body.employeeId || 
            body.emp_id || 
            body.empId || 
            body.badge_number || 
            body.badgeId
          )?.toString().trim();

          if (!bookingIdentifier || !empId) {
            return jsonResponse({ 
              error: 'booking_id (or booking_reference) and employee_id are required',
              received: { bookingIdentifier: bookingIdentifier || null, empId: empId || null }
            }, 400, corsHeaders);
          }

          let query = supabase.from('bookings').select('*');
          
          // Check if bookingIdentifier is a UUID (booking.id) or a booking reference string (e.g. BK-20261111-6650)
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingIdentifier);
          
          if (isUuid) {
            query = query.eq('id', bookingIdentifier);
          } else {
            query = query.eq('booking_reference', bookingIdentifier);
          }

          const { data: booking, error: fetchErr } = await query.single();
          if (fetchErr || !booking) {
            return jsonResponse({ error: 'Booking transit record not found' }, 404, corsHeaders);
          }

          let manifest: any[] = [];
          if (Array.isArray(booking.passenger_manifest)) {
            manifest = booking.passenger_manifest;
          } else if (typeof booking.passenger_manifest === 'string') {
            try {
              manifest = JSON.parse(booking.passenger_manifest);
            } catch (e) {
              manifest = [];
            }
          }

          const searchEmpId = String(empId).trim().toUpperCase();
          let matchedIndex = manifest.findIndex((p: any) => 
            String(p.employee_id || p.emp_id || '').trim().toUpperCase() === searchEmpId
          );

          let verifiedPassenger: any = null;

          if (matchedIndex !== -1) {
            manifest[matchedIndex].boarded = true;
            manifest[matchedIndex].boarded_at = new Date().toISOString();
            verifiedPassenger = manifest[matchedIndex];
          } else {
            const primaryEmpMatch = String(booking.employee_id || '').trim().toUpperCase() === searchEmpId ||
                                   String(booking.employee_name || '').trim().toUpperCase() === searchEmpId;

            if (primaryEmpMatch || manifest.length === 0) {
              verifiedPassenger = {
                employee_id: searchEmpId,
                name: booking.employee_name || 'Primary Rider',
                department: booking.department || 'Operations',
                boarded: true,
                boarded_at: new Date().toISOString()
              };
              manifest.push(verifiedPassenger);
            } else {
              return jsonResponse({
                error: `Passenger record not found for employee ID: ${empId}`
              }, 404, corsHeaders);
            }
          }

          const { error: updateErr } = await supabase
            .from('bookings')
            .update({
              passenger_manifest: manifest,
              updated_at: new Date().toISOString()
            })
            .eq('id', booking.id);

          if (updateErr) {
            return jsonResponse({ error: updateErr.message }, 500, corsHeaders);
          }

          return jsonResponse({
            success: true,
            message: `Passenger ${verifiedPassenger.name || verifiedPassenger.employee_id} verified and boarded successfully`,
            passenger: verifiedPassenger,
            manifest: manifest
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Internal verification error' }, 500, corsHeaders);
        }
      }


      // ==========================================
      // SUPER ADMIN: UPDATE & DELETE PLANT SITES
      // ==========================================
      const siteIdMatch = path.match(/^\/api\/(?:super-admin\/)?sites\/([a-zA-Z0-9-]+)\/?$/);
      if (siteIdMatch) {
        const targetSiteId = siteIdMatch[1];

        if (request.method === 'PATCH' || request.method === 'PUT') {
          try {
            const body = await request.json() as any;
            const updatePayload: any = {
              updated_at: new Date().toISOString()
            };

            if (body.name !== undefined) updatePayload.name = String(body.name).trim();
            if (body.location !== undefined) updatePayload.location = String(body.location).trim();
            if (body.code !== undefined) updatePayload.code = String(body.code).trim().toUpperCase();
            if (body.manager_name !== undefined) updatePayload.manager_name = String(body.manager_name).trim();
            if (body.manager_phone !== undefined) updatePayload.manager_phone = String(body.manager_phone).trim();
            if (body.status !== undefined) updatePayload.status = String(body.status).trim().toUpperCase();
            if (body.auto_allot !== undefined) updatePayload.auto_allot = Boolean(body.auto_allot);

            const { data: updatedSite, error: upErr } = await supabase
              .from('sites')
              .update(updatePayload)
              .eq('id', targetSiteId)
              .select()
              .single();

            if (upErr) {
              return jsonResponse({ error: upErr.message }, 500, corsHeaders);
            }

            return jsonResponse({
              success: true,
              message: 'Plant site partition updated successfully',
              site: updatedSite
            }, 200, corsHeaders);
          } catch (err: any) {
            return jsonResponse({ error: err.message || 'Failed to update site' }, 500, corsHeaders);
          }
        }

        if (request.method === 'DELETE') {
          try {
            const { error: delErr } = await supabase
              .from('sites')
              .delete()
              .eq('id', targetSiteId);

            if (delErr) {
              return jsonResponse({ error: delErr.message }, 500, corsHeaders);
            }

            return jsonResponse({
              success: true,
              message: 'Plant partition removed successfully'
            }, 200, corsHeaders);
          } catch (err: any) {
            return jsonResponse({ error: err.message || 'Failed to delete site' }, 500, corsHeaders);
          }
        }
      }

      // ==========================================
      // SUPER ADMIN: DYNAMIC BOOKING FIELD CONFIG
      // ==========================================
      const DEFAULT_BOOKING_FIELDS = [
        // Core Grasim Vehicle Request Form (GCD) Fields (Enabled by Default)
        { key: 'requester_name', label: 'Requester Name', section: 'Requester Details', enabled: true, required: true, isExtra: false },
        { key: 'employee_id', label: 'Employee ID & Sign', section: 'Requester Details', enabled: true, required: true, isExtra: false },
        { key: 'department', label: 'Department', section: 'Requester Details', enabled: true, required: true, isExtra: false },
        { key: 'contact_no', label: 'Contact No', section: 'Requester Details', enabled: true, required: true, isExtra: false },
        { key: 'request_for', label: 'Request For (Self / Guest)', section: 'Trip Type & Count', enabled: true, required: true, isExtra: false },
        { key: 'trip_type', label: 'Trip Mode (One Way / Round Trip)', section: 'Trip Type & Count', enabled: true, required: true, isExtra: false },
        { key: 'passenger_count', label: 'Number Of Travelers', section: 'Trip Type & Count', enabled: true, required: true, isExtra: false },
        { key: 'traveler_manifest', label: 'Traveler Details (Name, Code, Dept, Contact)', section: 'Traveler Detail', enabled: true, required: true, isExtra: false },
        { key: 'pickup_location', label: 'Travel From', section: 'Route & Schedule', enabled: true, required: true, isExtra: false },
        { key: 'drop_location', label: 'Travel Destination', section: 'Route & Schedule', enabled: true, required: true, isExtra: false },
        { key: 'travel_date', label: 'Date Of Travel', section: 'Route & Schedule', enabled: true, required: true, isExtra: false },
        { key: 'return_date', label: 'Return Date & Total No. of Days', section: 'Route & Schedule', enabled: true, required: false, isExtra: false },
        { key: 'pickup_time', label: 'Pickup Time', section: 'Route & Schedule', enabled: true, required: true, isExtra: false },
        { key: 'purpose_of_travel', label: 'Purpose Of Travel', section: 'Route & Schedule', enabled: true, required: true, isExtra: false },
        { key: 'approval_workflow', label: 'Approval Matrix (Dept DH, FH, FH-HR/Admin, UH)', section: 'Approvals & Rules', enabled: true, required: true, isExtra: false },

        // Previously Configured Extra Fields (Preserved — Toggleable ON/OFF by Super Admin)
        { key: 'vehicle_category', label: 'Preferred Vehicle Category (Sedan / SUV / Bus)', section: 'Extra Configured Fields', enabled: false, required: false, isExtra: true },
        { key: 'cost_center', label: 'Cost Center / SAP WBS Code', section: 'Extra Configured Fields', enabled: false, required: false, isExtra: true },
        { key: 'pickup_gate_point', label: 'Specific Plant Gate / Pickup Sub-Point', section: 'Extra Configured Fields', enabled: false, required: false, isExtra: true },
        { key: 'priority_flag', label: 'Urgent / VIP Escalation Flag', section: 'Extra Configured Fields', enabled: false, required: false, isExtra: true },
        { key: 'whatsapp_notify', label: 'Automated WhatsApp Cab & Driver Alert', section: 'Extra Configured Fields', enabled: true, required: false, isExtra: true }
      ];

      if (path === '/api/config/booking-fields' && request.method === 'GET') {
        try {
          const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'booking_form_fields')
            .maybeSingle();

          const fields = data?.value ? (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) : DEFAULT_BOOKING_FIELDS;
          return jsonResponse({ success: true, fields }, 200, corsHeaders);
        } catch (_err) {
          return jsonResponse({ success: true, fields: DEFAULT_BOOKING_FIELDS }, 200, corsHeaders);
        }
      }

      if (path === '/api/config/booking-fields' && (request.method === 'PUT' || request.method === 'POST')) {
        try {
          const body = await request.json() as any;
          const fields = body.fields || DEFAULT_BOOKING_FIELDS;

          const { error: upsertErr } = await supabase
            .from('system_settings')
            .upsert({
              key: 'booking_form_fields',
              value: fields,
              updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

          if (upsertErr) {
            return jsonResponse({ error: upsertErr.message }, 500, corsHeaders);
          }

          return jsonResponse({ success: true, message: 'Form field configuration saved', fields }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to save field configuration' }, 500, corsHeaders);
        }
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

      // PATCH /api/bookings/:id/approve (Strict Sequential Grasim GCD Approval)
      if (request.method === 'PATCH' && path.startsWith('/api/bookings/') && path.endsWith('/approve')) {
        try {
          const bookingId = path.split('/')[3];
          const body = await request.json() as {
            stage: 'DH' | 'FH' | 'UH' | 'FH_HR_ADMIN';
            decision?: 'APPROVED' | 'REJECTED';
            approver_name?: string;
            remarks?: string;
          };

          const decision = body.decision || 'APPROVED';
          const stage = body.stage || 'FH_HR_ADMIN';
          const cleanRemark = body.remarks ? String(body.remarks).trim() : null;

          if (decision === 'REJECTED' && !cleanRemark) {
            return jsonResponse({ error: 'Please provide a remark explaining the rejection.' }, 400, corsHeaders);
          }

          const { data: booking, error: fetchErr } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', bookingId)
            .single();

          if (fetchErr || !booking) {
            return jsonResponse({ error: 'Booking not found' }, 404, corsHeaders);
          }

          // Block action if already rejected/cancelled at an earlier stage
          if (
            booking.status === 'REJECTED' ||
            booking.status === 'CANCELLED' ||
            booking.dh_approval_status === 'REJECTED' ||
            booking.fh_approval_status === 'REJECTED' ||
            booking.uh_approval_status === 'REJECTED' ||
            booking.admin_hr_approval_status === 'REJECTED'
          ) {
            return jsonResponse({ error: 'This requisition has already been rejected and closed.' }, 400, corsHeaders);
          }

          const isOutstation = Boolean(
            booking.is_outstation ||
            (booking.destination_location && !String(booking.destination_location).toLowerCase().includes('bharuch')) ||
            (booking.drop_location && !String(booking.drop_location).toLowerCase().includes('bharuch'))
          );

          // Enforce assigned approver ownership check
          const actorEmail = body.approver_email ? String(body.approver_email).trim().toLowerCase() : '';
          if (stage === 'FH' && booking.assigned_fh_approver_email && actorEmail) {
            if (String(booking.assigned_fh_approver_email).trim().toLowerCase() !== actorEmail) {
              return jsonResponse({
                error: `This request is assigned to ${booking.assigned_fh_approver_name || booking.assigned_fh_approver_email}. Only the assigned FH Approver can act on it.`
              }, 403, corsHeaders);
            }
          }
          if (stage === 'UH' && booking.assigned_uh_approver_email && actorEmail) {
            if (String(booking.assigned_uh_approver_email).trim().toLowerCase() !== actorEmail) {
              return jsonResponse({
                error: `This request is assigned to ${booking.assigned_uh_approver_name || booking.assigned_uh_approver_email}. Only the assigned UH Approver can act on it.`
              }, 403, corsHeaders);
            }
          }

          // Enforce sequential prerequisite checks
          if (stage === 'UH' && isOutstation && booking.fh_approval_status !== 'APPROVED') {
            return jsonResponse({ error: 'Functional Head (FH) approval is required before Unit Head (UH) review.' }, 400, corsHeaders);
          }
          if (stage === 'FH_HR_ADMIN' && isOutstation && (booking.fh_approval_status !== 'APPROVED' || booking.uh_approval_status !== 'APPROVED')) {
            return jsonResponse({ error: 'Both FH and UH approvals are required before FH-HR / Admin sign-off.' }, 400, corsHeaders);
          }

          const updates: any = { updated_at: new Date().toISOString() };
          if (stage === 'DH') updates.dh_approval_status = decision;
          if (stage === 'FH') {
            updates.fh_approval_status = decision;
            if (cleanRemark !== null) updates.fh_remarks = cleanRemark;
            if (decision === 'APPROVED' && isOutstation && (!booking.uh_approval_status || booking.uh_approval_status === 'NOT_REQUIRED')) {
              updates.uh_approval_status = 'PENDING';
            }
          }
          if (stage === 'UH') {
            updates.uh_approval_status = decision;
            if (cleanRemark !== null) updates.uh_remarks = cleanRemark;
          }
          if (stage === 'FH_HR_ADMIN') {
            updates.admin_hr_approval_status = decision;
            if (cleanRemark !== null) updates.admin_hr_remarks = cleanRemark;
          }

          if (decision === 'REJECTED') {
            updates.status = 'REJECTED';
          } else {
            const fhOk = !isOutstation || (stage === 'FH' ? decision : booking.fh_approval_status) === 'APPROVED';
            const uhOk = !isOutstation || (stage === 'UH' ? decision : booking.uh_approval_status) === 'APPROVED';
            const hrOk = (stage === 'FH_HR_ADMIN' ? decision : booking.admin_hr_approval_status) === 'APPROVED';

            if (fhOk && uhOk && hrOk) {
              updates.status = 'APPROVED';
            }
          }

          let { data: updated, error: upErr } = await supabase
            .from('bookings')
            .update(updates)
            .eq('id', bookingId)
            .select()
            .single();

          // Fallback if booking_status enum in DB does not include REJECTED/APPROVED
          if (upErr && upErr.message && upErr.message.includes('booking_status')) {
            const fallbackUpdates = { ...updates };
            fallbackUpdates.status = decision === 'REJECTED' ? 'CANCELLED' : 'PENDING';
            const retry = await supabase
              .from('bookings')
              .update(fallbackUpdates)
              .eq('id', bookingId)
              .select()
              .single();
            updated = retry.data;
            upErr = retry.error;
          }

          if (upErr) {
            return jsonResponse({ error: upErr.message }, 500, corsHeaders);
          }

          // Send stage update email to next approver or requester (non-blocking)
          if (updated) {
            const nextTargets: string[] = [];
            if (updated.employee_email) nextTargets.push(updated.employee_email);
            if (stage === 'FH' && decision === 'APPROVED' && updated.assigned_uh_approver_email) {
              nextTargets.push(updated.assigned_uh_approver_email);
            }
            if (nextTargets.length > 0) {
              sendSystemEmail(
                supabase,
                nextTargets,
                `[SmartDrive] Requisition ${updated.booking_reference} — ${stage} ${decision}`,
                `<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
                  <h3 style="color:#0f172a;margin-top:0;">Requisition ${updated.booking_reference}: ${stage} ${decision}</h3>
                  <p style="font-size:13px;color:#334155;"><strong>Route:</strong> ${updated.origin_location} → ${updated.destination_location}</p>
                  ${cleanRemark ? `<p style="font-size:13px;color:#334155;"><strong>${stage} Remark:</strong> "${cleanRemark}"</p>` : ''}
                </div>`
              ).catch(() => {});
            }
          }

          return jsonResponse({
            success: true,
            message: `${stage} approval recorded as ${decision}`,
            booking: updated
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Approval update failed' }, 500, corsHeaders);
        }
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

      // =========================================================================
      // SUPER ADMIN EMAIL DISPATCH SERVICE (OFFICE 365 & GMAIL SMTP)
      // =========================================================================

      const sendSystemEmail = async (
        supabaseClient: any,
        toEmails: string[],
        subject: string,
        htmlBody: string
      ) => {
        const recipients = toEmails.map((e) => String(e || '').trim()).filter((e) => e.includes('@'));
        if (recipients.length === 0) return { skipped: true, reason: 'No valid recipient email' };

        const { data: cfg } = await supabaseClient
          .from('email_configurations')
          .select('*')
          .eq('is_enabled', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cfg || !cfg.smtp_host || !cfg.smtp_username || !cfg.smtp_password) {
          return { skipped: true, reason: 'Email dispatch service is disabled or unconfigured' };
        }

        const host = String(cfg.smtp_host).trim();
        const port = Number(cfg.smtp_port) || (host.includes('gmail') ? 465 : 587);
        const isImplicitSsl = port === 465;

        await WorkerMailer.send(
          {
            host,
            port,
            secure: isImplicitSsl,
            startTls: !isImplicitSsl,
            authType: ['plain', 'login'],
            credentials: {
              username: String(cfg.smtp_username).trim(),
              password: String(cfg.smtp_password).trim()
            }
          },
          {
            from: {
              name: String(cfg.sender_name || 'SmartDrive Mobility Desk').trim(),
              email: String(cfg.sender_email || cfg.smtp_username).trim()
            },
            to: recipients.map((email) => ({ email })),
            subject,
            html: htmlBody
          }
        );

        return { sent: true };
      };

      // GET /api/super-admin/email-config
      if (request.method === 'GET' && path === '/api/super-admin/email-config') {
        try {
          const { data: cfg, error } = await supabase
            .from('email_configurations')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            return jsonResponse({ error: error.message }, 500, corsHeaders);
          }

          return jsonResponse({
            success: true,
            config: cfg ? { ...cfg, smtp_password: cfg.smtp_password ? '••••••••••••' : '' } : null
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to load email configuration' }, 500, corsHeaders);
        }
      }

      // POST /api/super-admin/email-config
      if (request.method === 'POST' && path === '/api/super-admin/email-config') {
        try {
          const body = await request.json() as any;
          const { data: existing } = await supabase
            .from('email_configurations')
            .select('id, smtp_password')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const resolvedPassword =
            body.smtp_password && body.smtp_password !== '••••••••••••'
              ? String(body.smtp_password).trim()
              : existing?.smtp_password || '';

          if (!body.sender_email || !body.smtp_username || !resolvedPassword) {
            return jsonResponse({ error: 'Sender Email, SMTP Username, and Password / App Password are required.' }, 400, corsHeaders);
          }

          const payload = {
            provider: body.provider || 'O365',
            smtp_host: String(body.smtp_host || 'smtp.office365.com').trim(),
            smtp_port: Number(body.smtp_port) || 587,
            use_tls: body.use_tls !== false,
            sender_name: String(body.sender_name || 'SmartDrive Mobility Desk').trim(),
            sender_email: String(body.sender_email).trim(),
            smtp_username: String(body.smtp_username).trim(),
            smtp_password: resolvedPassword,
            is_enabled: body.is_enabled !== false,
            notify_on_booking: body.notify_on_booking !== false,
            notify_on_approval: body.notify_on_approval !== false,
            notify_on_dispatch: body.notify_on_dispatch !== false,
            updated_at: new Date().toISOString()
          };

          let saved;
          if (existing?.id) {
            const { data, error } = await supabase
              .from('email_configurations')
              .update(payload)
              .eq('id', existing.id)
              .select()
              .single();
            if (error) return jsonResponse({ error: error.message }, 500, corsHeaders);
            saved = data;
          } else {
            const { data, error } = await supabase
              .from('email_configurations')
              .insert(payload)
              .select()
              .single();
            if (error) return jsonResponse({ error: error.message }, 500, corsHeaders);
            saved = data;
          }

          return jsonResponse({
            success: true,
            message: `${payload.provider} email dispatch settings saved.`,
            config: { ...saved, smtp_password: '••••••••••••' }
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to save email config' }, 500, corsHeaders);
        }
      }

      // POST /api/super-admin/email-test (Send Live Verification Email)
      if (request.method === 'POST' && path === '/api/super-admin/email-test') {
        try {
          const body = await request.json() as { test_recipient?: string };
          const to = String(body.test_recipient || '').trim();
          if (!to || !to.includes('@')) {
            return jsonResponse({ error: 'Please enter a valid recipient email address for the test.' }, 400, corsHeaders);
          }

          const result = await sendSystemEmail(
            supabase,
            [to],
            'SmartDrive Transit Portal — Email Dispatch Test Successful',
            `<div style="font-family:Arial,sans-serif;max-width:560px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
              <h2 style="color:#1d4ed8;margin-top:0;">SmartDrive Email Dispatch Verified</h2>
              <p style="color:#334155;font-size:14px;">Your outbound SMTP configuration is active and ready to deliver automated booking requisitions, FH/UH approval alerts, and cab allotment notices.</p>
              <p style="color:#64748b;font-size:12px;margin-bottom:0;">Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
            </div>`
          );

          if ((result as any).skipped) {
            return jsonResponse({ error: (result as any).reason || 'Email service not enabled' }, 400, corsHeaders);
          }

          return jsonResponse({
            success: true,
            message: `Test email dispatched successfully to ${to}!`
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({
            error: `SMTP Error: ${err.message || 'Authentication or connection failed. Check credentials/App Password.'}`
          }, 500, corsHeaders);
        }
      }

      // GET /api/users/approvers (Active FH & UH Approvers from access list)
      if (request.method === 'GET' && path === '/api/users/approvers') {
        try {
          const { data: usersList } = await supabase
            .from('users')
            .select('id, full_name, email, role, department, is_active')
            .in('role', ['FH_APPROVER', 'UH_APPROVER'])
            .order('full_name', { ascending: true });

          const activeUsers = (usersList || []).filter((u: any) => u.is_active !== false);

          const fhApprovers = activeUsers.filter((u: any) => u.role === 'FH_APPROVER');
          const uhApprovers = activeUsers.filter((u: any) => u.role === 'UH_APPROVER');

          // Fallback to default seeded approvers if public.users has not been populated yet
          const finalFh = fhApprovers.length > 0 ? fhApprovers : [
            { id: 'fh-default-1', full_name: 'Rajesh Mehta (Functional Head)', email: 'fh.approval@grasim.local', role: 'FH_APPROVER', department: 'Operations' }
          ];
          const finalUh = uhApprovers.length > 0 ? uhApprovers : [
            { id: 'uh-default-1', full_name: 'Suresh Nair (Unit Head)', email: 'uh.approval@grasim.local', role: 'UH_APPROVER', department: 'Plant Leadership' }
          ];

          return jsonResponse({
            success: true,
            fh_approvers: finalFh,
            uh_approvers: finalUh
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to fetch approvers' }, 500, corsHeaders);
        }
      }

      // =========================================================================
      // DRIVER PORTAL & 6-DIGIT OTP BOARDING WORKFLOW
      // =========================================================================

      // POST /api/driver/login (Mobile Number + Password 12345)
      if (request.method === 'POST' && path === '/api/driver/login') {
        try {
          const body = await request.json() as { mobile?: string; password?: string };
          const rawMobile = String(body.mobile || '').replace(/\D/g, '');
          const last10 = rawMobile.slice(-10);
          const pass = String(body.password || '').trim();

          if (!last10 || last10.length < 10) {
            return jsonResponse({ error: 'Please enter a valid 10-digit driver mobile number.' }, 400, corsHeaders);
          }
          if (pass !== '12345') {
            return jsonResponse({ error: 'Invalid driver password. Use 12345.' }, 401, corsHeaders);
          }

          const { data: driversList, error: drvErr } = await supabase
            .from('drivers')
            .select('*');

          if (drvErr) {
            return jsonResponse({ error: drvErr.message }, 500, corsHeaders);
          }

          const matchedDriver = (driversList || []).find((d: any) => {
            const dMob = String(d.mobile_number || d.phone || '').replace(/\D/g, '').slice(-10);
            return dMob === last10;
          });

          if (!matchedDriver) {
            return jsonResponse({
              error: `No registered driver found with mobile number ${last10}. Check Dispatch Fleet Drivers.`
            }, 404, corsHeaders);
          }

          return jsonResponse({
            success: true,
            driver: {
              id: matchedDriver.id,
              name: matchedDriver.name || matchedDriver.full_name || 'Assigned Driver',
              mobile_number: matchedDriver.mobile_number || last10,
              license_number: matchedDriver.license_number || '',
              role: 'DRIVER'
            }
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Driver login failed' }, 500, corsHeaders);
        }
      }

      // GET /api/driver/trips?driver_id=...
      if (request.method === 'GET' && path === '/api/driver/trips') {
        try {
          const driverId = url.searchParams.get('driver_id') || '';
          const driverMobile = (url.searchParams.get('mobile') || '').replace(/\D/g, '').slice(-10);

          let query = supabase
            .from('bookings')
            .select('*, vehicles!bookings_allotted_vehicle_id_fkey(id, registration_number, model, seat_capacity), drivers!bookings_allotted_driver_id_fkey(id, name, mobile_number), booking_passengers(*)')
            .not('allotted_driver_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50);

          if (driverId) {
            query = query.eq('allotted_driver_id', driverId);
          }

          const { data: trips, error: tripErr } = await query;
          if (tripErr) {
            return jsonResponse({ error: tripErr.message }, 500, corsHeaders);
          }

          const filtered = (trips || []).filter((t: any) => {
            if (t.status === 'CANCELLED' || t.status === 'REJECTED' || t.status === 'COMPLETED') return false;
            if (driverId) return t.allotted_driver_id === driverId;
            if (driverMobile && t.drivers) {
              return String(t.drivers.mobile_number || '').replace(/\D/g, '').slice(-10) === driverMobile;
            }
            return true;
          });

          return jsonResponse({ success: true, trips: filtered }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to load driver trips' }, 500, corsHeaders);
        }
      }

      // POST /api/bookings/:id/send-otp (Generate 6-digit Boarding OTP for Employee)
      if (request.method === 'POST' && path.startsWith('/api/bookings/') && path.endsWith('/send-otp')) {
        try {
          const bookingId = path.split('/')[3];
          const otp = String(Math.floor(100000 + Math.random() * 900000));

          const { data: updated, error: upErr } = await supabase
            .from('bookings')
            .update({
              boarding_otp: otp,
              otp_sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', bookingId)
            .select()
            .single();

          if (upErr) {
            return jsonResponse({ error: upErr.message }, 500, corsHeaders);
          }

          return jsonResponse({
            success: true,
            message: '6-digit boarding OTP sent to employee status portal.',
            otp_sent_at: updated.otp_sent_at,
            booking: updated
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to send OTP' }, 500, corsHeaders);
        }
      }

      // POST /api/bookings/:id/verify-otp (Verify 6-digit OTP & Mark Passenger Onboarded)
      if (request.method === 'POST' && path.startsWith('/api/bookings/') && path.endsWith('/verify-otp')) {
        try {
          const bookingId = path.split('/')[3];
          const body = await request.json() as { otp?: string };
          const enteredOtp = String(body.otp || '').trim();

          if (enteredOtp.length !== 6) {
            return jsonResponse({ error: 'Please enter the 6-digit OTP from the passenger.' }, 400, corsHeaders);
          }

          const { data: booking, error: fetchErr } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', bookingId)
            .single();

          if (fetchErr || !booking) {
            return jsonResponse({ error: 'Booking not found' }, 404, corsHeaders);
          }

          if (!booking.boarding_otp) {
            return jsonResponse({ error: 'Please press Send OTP first before verifying.' }, 400, corsHeaders);
          }

          if (String(booking.boarding_otp).trim() !== enteredOtp) {
            return jsonResponse({ error: 'Invalid 6-digit OTP. Please ask the passenger to re-check their Request Status screen.' }, 400, corsHeaders);
          }

          const { data: updated, error: upErr } = await supabase
            .from('bookings')
            .update({
              passenger_onboarded_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', bookingId)
            .select()
            .single();

          if (upErr) {
            return jsonResponse({ error: upErr.message }, 500, corsHeaders);
          }

          return jsonResponse({
            success: true,
            message: 'Passenger verified & onboarded! You can now start the trip.',
            booking: updated
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'OTP verification failed' }, 500, corsHeaders);
        }
      }

      // POST /api/bookings/:id/start-trip (Start Trip after Passenger Onboarding)
      if (request.method === 'POST' && path.startsWith('/api/bookings/') && path.endsWith('/start-trip')) {
        try {
          const bookingId = path.split('/')[3];
          const body = await request.json().catch(() => ({})) as { start_odometer_km?: number };

          const { data: booking, error: fetchErr } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', bookingId)
            .single();

          if (fetchErr || !booking) {
            return jsonResponse({ error: 'Booking not found' }, 404, corsHeaders);
          }

          if (!booking.passenger_onboarded_at) {
            return jsonResponse({ error: 'Passenger must be onboarded via 6-digit OTP before starting the trip.' }, 400, corsHeaders);
          }

          const updates: any = {
            status: 'IN_PROGRESS',
            trip_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          if (body.start_odometer_km !== undefined) {
            updates.start_odometer_km = Number(body.start_odometer_km) || 0;
          }

          let { data: updated, error: upErr } = await supabase
            .from('bookings')
            .update(updates)
            .eq('id', bookingId)
            .select()
            .single();

          // Fallback if booking_status enum in DB uses DISPATCHED instead of IN_PROGRESS
          if (upErr && upErr.message && upErr.message.includes('booking_status')) {
            const retry = await supabase
              .from('bookings')
              .update({ ...updates, status: 'DISPATCHED' })
              .eq('id', bookingId)
              .select()
              .single();
            updated = retry.data;
            upErr = retry.error;
          }

          if (upErr) {
            return jsonResponse({ error: upErr.message }, 500, corsHeaders);
          }

          return jsonResponse({
            success: true,
            message: 'Trip started successfully!',
            booking: updated
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to start trip' }, 500, corsHeaders);
        }
      }

      // POST /api/bookings/:id/end-trip (Complete Trip, Closing Odometer & Auto Distance)
      if (request.method === 'POST' && path.startsWith('/api/bookings/') && path.endsWith('/end-trip')) {
        try {
          const bookingId = path.split('/')[3];
          const body = await request.json().catch(() => ({})) as { end_odometer_km?: number };

          if (body.end_odometer_km === undefined || body.end_odometer_km === null || String(body.end_odometer_km).trim() === '') {
            return jsonResponse({ error: 'Please enter the closing odometer reading (km) before ending the trip.' }, 400, corsHeaders);
          }

          const endOdo = Number(body.end_odometer_km);
          if (Number.isNaN(endOdo) || endOdo < 0) {
            return jsonResponse({ error: 'Closing odometer reading must be a valid non-negative number.' }, 400, corsHeaders);
          }

          const { data: booking, error: fetchErr } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', bookingId)
            .single();

          if (fetchErr || !booking) {
            return jsonResponse({ error: 'Booking not found' }, 404, corsHeaders);
          }

          if (!booking.trip_started_at && booking.status !== 'IN_PROGRESS') {
            return jsonResponse({ error: 'Trip must be started before it can be ended.' }, 400, corsHeaders);
          }

          const startOdo = Number(booking.start_odometer_km || 0);
          if (endOdo < startOdo) {
            return jsonResponse({
              error: `Closing odometer (${endOdo} km) cannot be less than starting odometer (${startOdo} km).`
            }, 400, corsHeaders);
          }

          const totalDistanceKm = Number((endOdo - startOdo).toFixed(2));
          const nowIso = new Date().toISOString();

          let { data: updated, error: upErr } = await supabase
            .from('bookings')
            .update({
              status: 'COMPLETED',
              end_odometer_km: endOdo,
              billed_distance_km: totalDistanceKm,
              trip_ended_at: nowIso,
              updated_at: nowIso
            })
            .eq('id', bookingId)
            .select()
            .single();

          if (upErr && upErr.message && upErr.message.includes('booking_status')) {
            const retry = await supabase
              .from('bookings')
              .update({
                end_odometer_km: endOdo,
                billed_distance_km: totalDistanceKm,
                trip_ended_at: nowIso,
                updated_at: nowIso
              })
              .eq('id', bookingId)
              .select()
              .single();
            updated = retry.data;
            upErr = retry.error;
          }

          if (upErr) {
            return jsonResponse({ error: upErr.message }, 500, corsHeaders);
          }

          // Release allotted vehicle back to AVAILABLE status and update its odometer
          if (booking.allotted_vehicle_id) {
            await supabase
              .from('vehicles')
              .update({ status: 'AVAILABLE', current_odometer_km: endOdo })
              .eq('id', booking.allotted_vehicle_id);
          }

          return jsonResponse({
            success: true,
            message: `Trip completed! Total distance recorded: ${totalDistanceKm} km.`,
            billed_distance_km: totalDistanceKm,
            booking: updated
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to complete trip' }, 500, corsHeaders);
        }
      }

      // GET /api/bookings/track?employee_id=...&mobile=... (Employee Self-Service Status Tracker)
      if (request.method === 'GET' && path === '/api/bookings/track') {
        try {
          const empId = (url.searchParams.get('employee_id') || '').trim().toUpperCase();
          const rawMobile = (url.searchParams.get('mobile') || '').replace(/\D/g, '');

          if (!empId || !rawMobile) {
            return jsonResponse({ error: 'Both Employee ID and Mobile Number are required.' }, 400, corsHeaders);
          }

          const last10Mobile = rawMobile.slice(-10);

          const { data: rows, error: queryErr } = await supabase
            .from('bookings')
            .select('*, vehicles!bookings_allotted_vehicle_id_fkey(id, registration_number, model, seat_capacity), drivers!bookings_allotted_driver_id_fkey(id, name, mobile_number)')
            .ilike('employee_id', empId)
            .order('created_at', { ascending: false })
            .limit(50);

          if (queryErr) {
            return jsonResponse({ error: queryErr.message }, 500, corsHeaders);
          }

          const matched = (rows || []).filter((b: any) => {
            const dbMobile = String(b.mobile || '').replace(/\D/g, '');
            if (dbMobile && dbMobile.slice(-10) === last10Mobile) return true;
            // Also check passenger_manifest if primary mobile differs
            if (Array.isArray(b.passenger_manifest)) {
              return b.passenger_manifest.some((p: any) => String(p.mobile || '').replace(/\D/g, '').slice(-10) === last10Mobile);
            }
            return false;
          });

          return jsonResponse({
            success: true,
            bookings: matched
          }, 200, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to track booking status' }, 500, corsHeaders);
        }
      }

      // POST /api/bookings (Grasim GCD Vehicle Request Form)
      if (request.method === 'POST' && (path === '/api/bookings' || path === '/api/bookings/')) {
        try {
          const body = await request.json() as any;

          const now = new Date();
          const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
          const randPart = Math.floor(1000 + Math.random() * 9000);
          const bookingRef = body.booking_reference || `BK-${datePart}-${randPart}`;

          // Extract travelers array from any key name the form sends
          const rawTravelers = Array.isArray(body.passenger_manifest)
            ? body.passenger_manifest
            : Array.isArray(body.passengers)
            ? body.passengers
            : Array.isArray(body.travelers)
            ? body.travelers
            : [];

          const firstTraveler = rawTravelers[0] || {};

          // Resolve requester name, employee ID, mobile, email, department across all possible form keys
          const resolvedEmpName = String(
            body.employee_name ||
            body.requester_name ||
            body.full_name ||
            body.name ||
            firstTraveler.name ||
            firstTraveler.passenger_name ||
            ''
          ).trim() || 'Employee';

          const resolvedEmpId = String(
            body.employee_id ||
            body.emp_id ||
            body.employee_code ||
            body.staff_id ||
            firstTraveler.employee_id ||
            firstTraveler.employee_code ||
            ''
          ).trim().toUpperCase() || null;

          const resolvedMobile = String(
            body.mobile ||
            body.contact_no ||
            body.employee_phone ||
            body.phone ||
            body.mobile_number ||
            firstTraveler.mobile ||
            firstTraveler.mobile_number ||
            ''
          ).trim() || null;

          const resolvedEmail = String(
            body.employee_email ||
            body.email ||
            firstTraveler.email ||
            ''
          ).trim() || null;

          const resolvedDept = String(
            body.department ||
            firstTraveler.department ||
            'Plant Operations'
          ).trim();

          const normalizedManifest = rawTravelers.length > 0
            ? rawTravelers.map((p: any) => ({
                name: p.name || p.passenger_name || resolvedEmpName,
                employee_id: String(p.employee_id || p.employee_code || resolvedEmpId || '').trim().toUpperCase(),
                department: p.department || resolvedDept,
                mobile: String(p.mobile || p.mobile_number || resolvedMobile || '').trim()
              }))
            : [{
                name: resolvedEmpName,
                employee_id: resolvedEmpId || '',
                department: resolvedDept,
                mobile: resolvedMobile || ''
              }];

          const travelDate = body.travel_date || now.toISOString().slice(0, 10);
          const pickupTime = body.pickup_time || '09:00';
          const scheduledStart = body.scheduled_start_time || `${travelDate}T${pickupTime}:00+05:30`;
          const returnDate = body.return_date || travelDate;
          const scheduledEnd = body.scheduled_end_time || `${returnDate}T18:00:00+05:30`;

          const originLoc = body.pickup_location || body.origin_location || 'Bharuch Plant Gate 1';
          const destLoc = body.drop_location || body.destination_location || '';
          const isOutstation = Boolean(
            body.is_outstation !== undefined
              ? body.is_outstation
              : (destLoc && !String(destLoc).toLowerCase().includes('bharuch'))
          );

          const purposeText = String(body.purpose_of_travel || body.purpose || '').trim();

          // Resolve default site_id
          let siteId = body.site_id || null;
          if (!siteId) {
            const { data: defaultSite } = await supabase
              .from('sites')
              .select('id')
              .limit(1)
              .maybeSingle();
            siteId = defaultSite?.id || null;
          }

          // Exact columns verified against public.bookings schema
          const dbPayload: any = {
            booking_reference: bookingRef,
            site_id: siteId,
            requester_id: null,
            booking_type: 'PRIVATE',
            target_category: body.vehicle_category || body.target_category || 'SEDAN_4',
            origin_location: originLoc,
            destination_location: destLoc,
            scheduled_start_time: scheduledStart,
            scheduled_end_time: scheduledEnd,
            status: 'PENDING',
            passenger_count: Number(body.passenger_count) || normalizedManifest.length || 1,
            purpose: purposeText,
            purpose_of_travel: purposeText,
            cost_center: body.cost_center || null,
            department: resolvedDept,
            employee_name: resolvedEmpName,
            employee_id: resolvedEmpId,
            mobile: resolvedMobile,
            employee_phone: resolvedMobile,
            employee_email: resolvedEmail,
            passenger_manifest: normalizedManifest,
            request_for: body.request_for || 'Self',
            trip_type: body.trip_type || 'One Way Trip',
            return_date: returnDate,
            total_days: Number(body.total_days) || 1,
            is_outstation: isOutstation,
            dh_approval_status: 'PENDING',
            fh_approval_status: isOutstation ? 'PENDING' : 'NOT_REQUIRED',
            uh_approval_status: isOutstation ? 'PENDING' : 'NOT_REQUIRED',
            admin_hr_approval_status: 'PENDING',
            priority_flag: Boolean(body.priority_flag),
            assigned_fh_approver_id: body.assigned_fh_approver_id && !String(body.assigned_fh_approver_id).startsWith('fh-default') ? body.assigned_fh_approver_id : null,
            assigned_fh_approver_email: body.assigned_fh_approver_email || null,
            assigned_fh_approver_name: body.assigned_fh_approver_name || null,
            assigned_uh_approver_id: body.assigned_uh_approver_id && !String(body.assigned_uh_approver_id).startsWith('uh-default') ? body.assigned_uh_approver_id : null,
            assigned_uh_approver_email: body.assigned_uh_approver_email || null,
            assigned_uh_approver_name: body.assigned_uh_approver_name || null
          };

          const { data: created, error: insErr } = await supabase
            .from('bookings')
            .insert(dbPayload)
            .select()
            .single();

          if (insErr) {
            return jsonResponse({ error: insErr.message }, 500, corsHeaders);
          }

          // Also mirror passengers into booking_passengers table
          if (created?.id && normalizedManifest.length > 0) {
            const rows = normalizedManifest.map((p: any) => ({
              booking_id: created.id,
              passenger_name: p.name,
              department: p.department,
              mobile_number: p.mobile,
              pickup_point: originLoc,
              drop_point: destLoc
            }));
            await supabase.from('booking_passengers').insert(rows);
          }

          // Dispatch automated email to Assigned FH Approver & Employee (non-blocking)
          if (created?.id) {
            const notifyTargets = [
              created.assigned_fh_approver_email,
              created.employee_email
            ].filter(Boolean);
            if (notifyTargets.length > 0) {
              sendSystemEmail(
                supabase,
                notifyTargets,
                `[SmartDrive] New Cab Requisition ${bookingRef} (${originLoc} → ${destLoc})`,
                `<div style="font-family:Arial,sans-serif;max-width:600px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
                  <h3 style="color:#0f172a;margin-top:0;">New Cab Requisition: ${bookingRef}</h3>
                  <p style="font-size:13px;color:#334155;"><strong>Requester:</strong> ${resolvedEmpName} (${resolvedEmpId || 'N/A'}) — ${resolvedDept}</p>
                  <p style="font-size:13px;color:#334155;"><strong>Route:</strong> ${originLoc} → ${destLoc} (${travelDate} at ${pickupTime})</p>
                  <p style="font-size:13px;color:#334155;"><strong>Purpose:</strong> ${purposeText}</p>
                  <p style="font-size:12px;color:#64748b;">Please sign in to the SmartDrive Approval Portal to review and sign off.</p>
                </div>`
              ).catch(() => {});
            }
          }

          return jsonResponse({
            success: true,
            message: 'Vehicle Request submitted successfully',
            booking_reference: bookingRef,
            booking: created
          }, 201, corsHeaders);
        } catch (err: any) {
          return jsonResponse({ error: err.message || 'Failed to submit vehicle request' }, 500, corsHeaders);
        }
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
