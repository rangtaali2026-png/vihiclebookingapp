-- =============================================================================
-- Migration: 20261101000004_qr_manifest_and_attendance.sql
-- Description: Physical Vehicle QR Attendance Engine, Boarding Verification,
--              Live Occupancy Calculations, and Real-Time Driver Broadcast Hooks
-- Dependencies: 20261101000001_sites_and_tenancy.sql,
--               20261101000002_vehicles_and_drivers.sql,
--               20261101000003_bookings_and_participants.sql
-- Platform: Supabase / PostgreSQL 15+
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. VEHICLE QR SCAN SESSIONS & AUDIT LOGS
-- -----------------------------------------------------------------------------

-- Tracks each physical QR scan attempt (for tamper analysis and dead-zone audit)
CREATE TABLE IF NOT EXISTS vehicle_qr_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    scanned_employee_id VARCHAR(64) NOT NULL,
    scanned_mobile_number VARCHAR(20) NOT NULL,
    scan_status VARCHAR(32) NOT NULL,             -- 'SUCCESS', 'ALREADY_CHECKED_IN', 'OVER_CAPACITY', 'NO_ACTIVE_TRIP', 'INVALID_SIGNATURE'
    is_unscheduled_walkin BOOLEAN NOT NULL DEFAULT false,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes for scan audit queries
CREATE INDEX IF NOT EXISTS idx_qr_scans_site_created ON vehicle_qr_scans(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_scans_vehicle ON vehicle_qr_scans(vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_scans_emp ON vehicle_qr_scans(scanned_employee_id, scanned_mobile_number);

-- Enforce multi-tenant integrity on QR scan logs
CREATE TRIGGER trg_qr_scans_tenant_guard
  BEFORE INSERT OR UPDATE ON vehicle_qr_scans
  FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

-- -----------------------------------------------------------------------------
-- 2. LIVE OCCUPANCY ENGINE FUNCTIONS
-- -----------------------------------------------------------------------------

-- Computes current boarded headcount for an active booking
CREATE OR REPLACE FUNCTION app.fn_get_live_booking_occupancy(p_booking_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM trip_participants
  WHERE booking_id = p_booking_id
    AND check_in_status = 'BOARDED';
$$;

-- -----------------------------------------------------------------------------
-- 3. CORE STORED PROCEDURE: PROCESS VEHICLE CABIN QR SCAN
-- -----------------------------------------------------------------------------
-- Executes the atomic verification flow when an unauthenticated employee scans
-- the cabin QR code from any standard mobile browser.
CREATE OR REPLACE FUNCTION app.fn_process_qr_attendance(
  p_vehicle_id UUID,
  p_qr_uuid UUID,
  p_employee_id VARCHAR(64),
  p_mobile_number VARCHAR(20),
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_vehicle vehicles%ROWTYPE;
  v_booking bookings%ROWTYPE;
  v_participant trip_participants%ROWTYPE;
  v_current_occupancy INTEGER := 0;
  v_max_passengers INTEGER := 0;
  v_clean_emp_id VARCHAR(64);
  v_clean_mobile VARCHAR(20);
  v_now TIMESTAMPTZ := now();
  v_window_start TIMESTAMPTZ := now() - INTERVAL '45 minutes';
  v_window_end TIMESTAMPTZ := now() + INTERVAL '45 minutes';
BEGIN
  v_clean_emp_id := UPPER(TRIM(p_employee_id));
  v_clean_mobile := TRIM(p_mobile_number);

  -- 1. Validate physical vehicle and static QR token match
  SELECT * INTO v_vehicle
  FROM vehicles
  WHERE id = p_vehicle_id
    AND qr_code_uuid = p_qr_uuid
    AND status = 'ACTIVE';

  IF NOT FOUND THEN
    INSERT INTO vehicle_qr_scans (site_id, vehicle_id, scanned_employee_id, scanned_mobile_number, scan_status, user_agent, ip_address)
    VALUES (
      COALESCE((SELECT site_id FROM vehicles WHERE id = p_vehicle_id), '00000000-0000-0000-0000-000000000000'::uuid),
      p_vehicle_id, v_clean_emp_id, v_clean_mobile, 'INVALID_SIGNATURE', p_user_agent, p_ip_address
    );
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INVALID_VEHICLE_QR',
      'message', 'Invalid, expired, or inactive vehicle QR decal.'
    );
  END IF;

  -- 2. Locate active trip dispatched within operating window (±45 minutes)
  SELECT * INTO v_booking
  FROM bookings
  WHERE allotted_vehicle_id = v_vehicle.id
    AND status IN ('APPROVED', 'DISPATCHED')
    AND scheduled_start_time BETWEEN v_window_start AND v_window_end
  ORDER BY scheduled_start_time ASC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO vehicle_qr_scans (site_id, vehicle_id, scanned_employee_id, scanned_mobile_number, scan_status, user_agent, ip_address)
    VALUES (v_vehicle.site_id, v_vehicle.id, v_clean_emp_id, v_clean_mobile, 'NO_ACTIVE_TRIP', p_user_agent, p_ip_address);

    RETURN jsonb_build_object(
      'success', false,
      'code', 'NO_ACTIVE_TRIP',
      'message', 'No active or dispatched trip found for this vehicle at this time.'
    );
  END IF;

  -- Maximum passenger seats available (1 seat reserved for driver)
  v_max_passengers := v_vehicle.seat_capacity - 1;
  v_current_occupancy := app.fn_get_live_booking_occupancy(v_booking.id);

  -- 3. Check if passenger exists on current trip roster
  SELECT * INTO v_participant
  FROM trip_participants
  WHERE booking_id = v_booking.id
    AND employee_id = v_clean_emp_id
    AND mobile_number = v_clean_mobile;

  -- Scenario A: Passenger is already on the manifest
  IF FOUND THEN
    IF v_participant.check_in_status = 'BOARDED' THEN
      INSERT INTO vehicle_qr_scans (site_id, vehicle_id, booking_id, scanned_employee_id, scanned_mobile_number, scan_status, user_agent, ip_address)
      VALUES (v_vehicle.site_id, v_vehicle.id, v_booking.id, v_clean_emp_id, v_clean_mobile, 'ALREADY_CHECKED_IN', p_user_agent, p_ip_address);

      RETURN jsonb_build_object(
        'success', true,
        'code', 'ALREADY_CHECKED_IN',
        'message', 'You have already checked in to this vehicle.',
        'data', jsonb_build_object(
          'booking_id', v_booking.id,
          'vehicle_registration', v_vehicle.registration_number,
          'check_in_time', v_participant.check_in_time,
          'live_occupancy', v_current_occupancy,
          'seat_capacity', v_max_passengers
        )
      );
    END IF;

    -- Update existing passenger record to BOARDED
    UPDATE trip_participants
    SET check_in_status = 'BOARDED',
        check_in_time = v_now,
        check_in_mode = 'QR_SELF_SCAN',
        updated_at = v_now
    WHERE id = v_participant.id;

    v_current_occupancy := v_current_occupancy + 1;

    INSERT INTO vehicle_qr_scans (site_id, vehicle_id, booking_id, scanned_employee_id, scanned_mobile_number, scan_status, user_agent, ip_address)
    VALUES (v_vehicle.site_id, v_vehicle.id, v_booking.id, v_clean_emp_id, v_clean_mobile, 'SUCCESS', p_user_agent, p_ip_address);

    RETURN jsonb_build_object(
      'success', true,
      'code', 'BOARDING_CONFIRMED',
      'message', 'Check-in successful. Welcome aboard!',
      'data', jsonb_build_object(
        'booking_id', v_booking.id,
        'vehicle_registration', v_vehicle.registration_number,
        'employee_name', v_participant.employee_name,
        'check_in_time', v_now,
        'live_occupancy', v_current_occupancy,
        'seat_capacity', v_max_passengers,
        'is_unscheduled', false
      )
    );

  -- Scenario B: Unscheduled Passenger (Walk-in scan)
  ELSE
    -- Capacity check: cannot board if full
    IF v_current_occupancy >= v_max_passengers THEN
      INSERT INTO vehicle_qr_scans (site_id, vehicle_id, booking_id, scanned_employee_id, scanned_mobile_number, scan_status, is_unscheduled_walkin, user_agent, ip_address)
      VALUES (v_vehicle.site_id, v_vehicle.id, v_booking.id, v_clean_emp_id, v_clean_mobile, 'OVER_CAPACITY', true, p_user_agent, p_ip_address);

      RETURN jsonb_build_object(
        'success', false,
        'code', 'OVER_CAPACITY',
        'message', 'Vehicle has reached full capacity (' || v_max_passengers || ' seats). Boarding denied.'
      );
    END IF;

    -- Policy check: Private bookings reject unscheduled passengers
    IF v_booking.booking_type = 'PRIVATE' THEN
      INSERT INTO vehicle_qr_scans (site_id, vehicle_id, booking_id, scanned_employee_id, scanned_mobile_number, scan_status, is_unscheduled_walkin, user_agent, ip_address)
      VALUES (v_vehicle.site_id, v_vehicle.id, v_booking.id, v_clean_emp_id, v_clean_mobile, 'PRIVATE_RESERVATION_BLOCK', true, p_user_agent, p_ip_address);

      RETURN jsonb_build_object(
        'success', false,
        'code', 'PRIVATE_RESERVATION',
        'message', 'This vehicle is reserved for a private trip. Walk-in boarding not permitted.'
      );
    END IF;

    -- Add unscheduled participant and mark BOARDED
    INSERT INTO trip_participants (
      site_id,
      booking_id,
      employee_id,
      employee_name,
      mobile_number,
      check_in_status,
      check_in_time,
      check_in_mode,
      is_unscheduled
    ) VALUES (
      v_vehicle.site_id,
      v_booking.id,
      v_clean_emp_id,
      'Walk-In Employee',
      v_clean_mobile,
      'BOARDED',
      v_now,
      'QR_SELF_SCAN',
      true
    );

    v_current_occupancy := v_current_occupancy + 1;

    INSERT INTO vehicle_qr_scans (site_id, vehicle_id, booking_id, scanned_employee_id, scanned_mobile_number, scan_status, is_unscheduled_walkin, user_agent, ip_address)
    VALUES (v_vehicle.site_id, v_vehicle.id, v_booking.id, v_clean_emp_id, v_clean_mobile, 'SUCCESS', true, p_user_agent, p_ip_address);

    RETURN jsonb_build_object(
      'success', true,
      'code', 'UNSCHEDULED_BOARDING_RECORDED',
      'message', 'Unscheduled boarding confirmed. Seat allocated on shared trip.',
      'data', jsonb_build_object(
        'booking_id', v_booking.id,
        'vehicle_registration', v_vehicle.registration_number,
        'employee_name', 'Walk-In Employee',
        'check_in_time', v_now,
        'live_occupancy', v_current_occupancy,
        'seat_capacity', v_max_passengers,
        'is_unscheduled', true
      )
    );
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. REAL-TIME BROADCAST NOTIFIER FOR DRIVERS & ADMINS
-- -----------------------------------------------------------------------------
-- Triggers a Supabase Realtime broadcast message on channel `trip-<booking_id>`
-- whenever a participant changes state (e.g., from AWAITING to BOARDED).
CREATE OR REPLACE FUNCTION app.fn_broadcast_boarding_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_vehicle vehicles%ROWTYPE;
  v_live_occupancy INTEGER;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.check_in_status <> NEW.check_in_status) OR (TG_OP = 'INSERT') THEN
    SELECT * INTO v_booking FROM bookings WHERE id = NEW.booking_id;
    SELECT * INTO v_vehicle FROM vehicles WHERE id = v_booking.allotted_vehicle_id;
    
    v_live_occupancy := app.fn_get_live_booking_occupancy(NEW.booking_id);

    -- Broadcast to Postgres NOTIFY channel for edge Workers & Supabase Realtime subscribers
    PERFORM pg_notify(
      'trip_manifest_updates',
      jsonb_build_object(
        'booking_id', NEW.booking_id,
        'site_id', NEW.site_id,
        'participant_id', NEW.id,
        'employee_id', NEW.employee_id,
        'employee_name', NEW.employee_name,
        'status', NEW.check_in_status,
        'check_in_time', NEW.check_in_time,
        'check_in_mode', NEW.check_in_mode,
        'is_unscheduled', NEW.is_unscheduled,
        'live_occupancy', v_live_occupancy,
        'max_passengers', COALESCE(v_vehicle.seat_capacity - 1, 0)
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_broadcast_passenger_boarding
  AFTER INSERT OR UPDATE OF check_in_status ON trip_participants
  FOR EACH ROW EXECUTE FUNCTION app.fn_broadcast_boarding_event();

-- -----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES FOR QR SCAN SESSIONS
-- -----------------------------------------------------------------------------
ALTER TABLE vehicle_qr_scans ENABLE ROW LEVEL SECURITY;

-- Super Admin Global Oversight
CREATE POLICY "super_admin_manage_qr_scans"
  ON vehicle_qr_scans FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

-- Plant Admin View Site Scans
CREATE POLICY "plant_admin_view_site_qr_scans"
  ON vehicle_qr_scans FOR SELECT TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin());

-- Allow Edge API Service & Authenticated Users to Insert Scan Logs
CREATE POLICY "allow_insert_qr_scans"
  ON vehicle_qr_scans FOR INSERT TO anon, authenticated
  WITH CHECK (true);

COMMIT;