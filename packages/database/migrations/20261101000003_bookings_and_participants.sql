-- =============================================================================
-- Migration: 20261101000003_bookings_and_participants.sql
-- Description: Transport Reservations, Participant Capacity Rules, Fast Re-booking
-- Dependencies: 20261101000001_sites_and_tenancy.sql, 20261101000002_vehicles_and_drivers.sql
-- Platform: Supabase / PostgreSQL 15+
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENUMS FOR BOOKING & PARTICIPANT LIFECYCLE
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE booking_type AS ENUM (
    'PRIVATE',   -- Dedicated booking (strictly confidential / executive travel)
    'SHARED'     -- Open booking (allows auto-grouping and co-passenger additions)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM (
    'PENDING',      -- Awaiting Transport Admin or Auto-approval
    'APPROVED',     -- Vehicle & driver allotted; confirmation alerts dispatched
    'DISPATCHED',   -- Active trip; vehicle en route / at factory pickup gate
    'COMPLETED',    -- Journey successfully finished; feedback link active
    'CANCELLED',    -- Cancelled by Requester or Plant Admin
    'REJECTED'      -- Denied by Plant Admin with mandatory reason
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE boarding_status AS ENUM (
    'AWAITING',     -- Listed on manifest; waiting at pickup point
    'BOARDED',      -- Attendance validated via QR scan or driver manual toggle
    'NO_SHOW',      -- Passenger failed to board within scheduled departure window
    'CANCELLED'     -- Removed from participant list prior to trip departure
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE check_in_mode AS ENUM (
    'QR_SELF_SCAN',   -- Validated via unauthenticated cabin QR scan
    'DRIVER_MANUAL',  -- Marked present on driver manifest tablet/mobile
    'ADMIN_OVERRIDE'  -- Marked present via transport desk admin console
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. SEQUENCES FOR SITE-SPECIFIC HUMAN-READABLE BOOKING NUMBERS
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS booking_ref_seq START WITH 10001;

-- -----------------------------------------------------------------------------
-- 3. CORE BOOKINGS & PARTICIPANTS TABLES
-- -----------------------------------------------------------------------------

-- 3.1 Transport Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    booking_reference VARCHAR(32) NOT NULL,
    requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    
    -- Booking Type & Movement Classification
    booking_type booking_type NOT NULL DEFAULT 'SHARED',
    target_category vehicle_category NOT NULL DEFAULT 'SEDAN_4',
    
    -- Route Specification
    origin_location TEXT NOT NULL,
    destination_location TEXT NOT NULL,
    scheduled_start_time TIMESTAMPTZ NOT NULL,
    scheduled_end_time TIMESTAMPTZ,
    
    -- Fleet Allotment (Nullable until approved/allotted)
    status booking_status NOT NULL DEFAULT 'PENDING',
    allotted_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    allotted_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    
    -- Passenger Metrics & Fast Re-book Anchor
    passenger_count INTEGER NOT NULL DEFAULT 1 CHECK (passenger_count > 0),
    parent_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL, -- References source trip if generated via Fast Re-Book
    
    -- Administrative Metadata & Rejection Logging
    purpose TEXT,
    cost_center VARCHAR(64),
    rejection_reason TEXT,
    created_by_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Populated if booked on behalf of employee
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT uq_site_booking_ref UNIQUE (site_id, booking_reference),
    CONSTRAINT chk_booking_schedule CHECK (scheduled_end_time IS NULL OR scheduled_end_time >= scheduled_start_time)
);

-- 3.2 Trip Participants (Manifest & Attendance Roster)
CREATE TABLE IF NOT EXISTS trip_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    
    -- Passenger Identification
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(128) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    department VARCHAR(64),
    
    -- Boarding & Verification State
    check_in_status boarding_status NOT NULL DEFAULT 'AWAITING',
    check_in_time TIMESTAMPTZ,
    check_in_mode check_in_mode,
    is_unscheduled BOOLEAN NOT NULL DEFAULT false, -- Set TRUE for walk-ins scanning QR on shared rides
    
    -- Feedback Loop
    feedback_rating SMALLINT CHECK (feedback_rating BETWEEN 1 AND 5),
    feedback_comments TEXT,
    feedback_submitted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT uq_booking_participant_emp UNIQUE (booking_id, employee_id)
);

-- -----------------------------------------------------------------------------
-- 4. PERFORMANCE & OPERATIONAL INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_site_status ON bookings(site_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_requester ON bookings(site_id, requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_window ON bookings(allotted_vehicle_id, status, scheduled_start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_parent_fast_rebook ON bookings(parent_booking_id);

CREATE INDEX IF NOT EXISTS idx_participants_booking_status ON trip_participants(booking_id, check_in_status);
CREATE INDEX IF NOT EXISTS idx_participants_verification ON trip_participants(site_id, employee_id, mobile_number);
CREATE INDEX IF NOT EXISTS idx_participants_unscheduled ON trip_participants(booking_id, is_unscheduled);

-- -----------------------------------------------------------------------------
-- 5. AUTOMATED TRIGGERS & BUSINESS LOGIC ENFORCERS
-- -----------------------------------------------------------------------------

-- 5.1 Updated At Auto-Setter
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();

CREATE TRIGGER trg_participants_updated_at
  BEFORE UPDATE ON trip_participants
  FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();

-- 5.2 Multi-Tenant Partition Integrity
CREATE TRIGGER trg_bookings_tenant_guard
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

CREATE TRIGGER trg_participants_tenant_guard
  BEFORE INSERT OR UPDATE ON trip_participants
  FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

-- 5.3 Automated Booking Reference Generator (e.g., 'BK-PLANT-10023')
CREATE OR REPLACE FUNCTION app.fn_generate_booking_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_site_code VARCHAR(32);
BEGIN
  IF NEW.booking_reference IS NULL OR NEW.booking_reference = '' THEN
    SELECT COALESCE(site_code, 'PLANT') INTO v_site_code FROM sites WHERE id = NEW.site_id;
    NEW.booking_reference := 'BK-' || SUBSTRING(v_site_code FROM 7) || '-' || nextval('booking_ref_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bookings_generate_reference
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.fn_generate_booking_reference();

-- 5.4 Automatic Passenger Count Maintenance & Capacity Guard
CREATE OR REPLACE FUNCTION app.fn_sync_participant_headcount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_booking_id UUID;
  v_headcount INTEGER;
  v_max_seats INTEGER;
  v_vehicle_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_booking_id := OLD.booking_id;
  ELSE
    v_booking_id := NEW.booking_id;
  END IF;

  -- Compute total active passengers on the manifest
  SELECT COUNT(*) INTO v_headcount
  FROM trip_participants
  WHERE booking_id = v_booking_id
    AND check_in_status <> 'CANCELLED';

  -- Retrieve allotted vehicle capacity (driver excluded: max passengers = seat_capacity - 1)
  SELECT allotted_vehicle_id INTO v_vehicle_id FROM bookings WHERE id = v_booking_id;
  
  IF v_vehicle_id IS NOT NULL THEN
    SELECT (seat_capacity - 1) INTO v_max_seats FROM vehicles WHERE id = v_vehicle_id;
    IF v_headcount > v_max_seats THEN
      RAISE EXCEPTION 'Passenger roster headcount (%) exceeds available vehicle passenger seats (%)',
        v_headcount, v_max_seats;
    END IF;
  END IF;

  -- Update headcount metric on parent booking record
  UPDATE bookings
  SET passenger_count = GREATEST(v_headcount, 1),
      updated_at = now()
  WHERE id = v_booking_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_headcount_on_participant_change
  AFTER INSERT OR UPDATE OR DELETE ON trip_participants
  FOR EACH ROW EXECUTE FUNCTION app.fn_sync_participant_headcount();

-- 5.5 Fast Re-Booking Stored Procedure (Clones Trip & Participants with 1 Call)
CREATE OR REPLACE FUNCTION app.fn_create_fast_rebook(
  p_source_booking_id UUID,
  p_new_start_time TIMESTAMPTZ,
  p_new_end_time TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source bookings%ROWTYPE;
  v_new_booking_id UUID;
  v_current_user UUID;
BEGIN
  v_current_user := auth.uid();
  
  -- 1. Fetch historical source booking
  SELECT * INTO v_source 
  FROM bookings 
  WHERE id = p_source_booking_id 
    AND site_id = app.current_site_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source booking not found or unauthorized for fast re-booking.';
  END IF;

  -- 2. Create cloned booking draft in PENDING state
  INSERT INTO bookings (
    site_id,
    requester_id,
    booking_type,
    target_category,
    origin_location,
    destination_location,
    scheduled_start_time,
    scheduled_end_time,
    status,
    passenger_count,
    parent_booking_id,
    purpose,
    cost_center
  ) VALUES (
    v_source.site_id,
    v_current_user,
    v_source.booking_type,
    v_source.target_category,
    v_source.origin_location,
    v_source.destination_location,
    p_new_start_time,
    p_new_end_time,
    'PENDING',
    v_source.passenger_count,
    v_source.id,
    'Fast Re-Book: ' || COALESCE(v_source.purpose, 'Plant Regular Commute'),
    v_source.cost_center
  ) RETURNING id INTO v_new_booking_id;

  -- 3. Clone participants roster in AWAITING status
  INSERT INTO trip_participants (
    site_id,
    booking_id,
    employee_id,
    employee_name,
    mobile_number,
    department,
    check_in_status
  )
  SELECT 
    v_source.site_id,
    v_new_booking_id,
    employee_id,
    employee_name,
    mobile_number,
    department,
    'AWAITING'
  FROM trip_participants
  WHERE booking_id = v_source.id
    AND check_in_status <> 'CANCELLED';

  RETURN v_new_booking_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_participants ENABLE ROW LEVEL SECURITY;

-- 6.1 BOOKINGS POLICIES
CREATE POLICY "super_admin_manage_all_bookings"
  ON bookings FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_site_bookings"
  ON bookings FOR ALL TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin())
  WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "requesters_view_own_bookings"
  ON bookings FOR SELECT TO authenticated
  USING (site_id = app.current_site_id() AND requester_id = auth.uid());

CREATE POLICY "requesters_insert_own_bookings"
  ON bookings FOR INSERT TO authenticated
  WITH CHECK (site_id = app.current_site_id() AND requester_id = auth.uid());

CREATE POLICY "requesters_cancel_pending_bookings"
  ON bookings FOR UPDATE TO authenticated
  USING (site_id = app.current_site_id() AND requester_id = auth.uid() AND status = 'PENDING')
  WITH CHECK (site_id = app.current_site_id() AND requester_id = auth.uid() AND status = 'CANCELLED');

-- 6.2 TRIP PARTICIPANTS POLICIES
CREATE POLICY "super_admin_manage_all_participants"
  ON trip_participants FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_site_participants"
  ON trip_participants FOR ALL TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin())
  WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "requesters_manage_roster_on_pending_trips"
  ON trip_participants FOR ALL TO authenticated
  USING (
    site_id = app.current_site_id() AND
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = trip_participants.booking_id
        AND b.requester_id = auth.uid()
        AND b.status = 'PENDING'
    )
  )
  WITH CHECK (
    site_id = app.current_site_id() AND
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = trip_participants.booking_id
        AND b.requester_id = auth.uid()
        AND b.status = 'PENDING'
    )
  );

CREATE POLICY "drivers_view_dispatched_manifest"
  ON trip_participants FOR SELECT TO authenticated
  USING (
    site_id = app.current_site_id() AND
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = trip_participants.booking_id
        AND b.status IN ('APPROVED', 'DISPATCHED')
    )
  );

COMMIT;