import re

worker_path = "/workspaces/vihiclebookingapp/workers/api/src/index.ts"
with open(worker_path, "r", encoding="utf-8") as f:
    code = f.read()

pattern = r"// POST /api/bookings \(Grasim GCD Vehicle Request Form\)[\s\S]*?(?=\n\s*// GET /api/bookings\?site_id=)"

clean_post_bookings = """// POST /api/bookings (Grasim GCD Vehicle Request Form)
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
"""

if re.search(pattern, code):
    code = re.sub(pattern, clean_post_bookings, code, count=1)
    with open(worker_path, "w", encoding="utf-8") as f:
        f.write(code)
    print("✓ Updated POST /api/bookings with exact column mapping and full requester/traveler persistence.")
else:
    print("Could not match POST /api/bookings block; check workers/api/src/index.ts.")
