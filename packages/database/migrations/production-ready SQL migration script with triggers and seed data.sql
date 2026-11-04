-- =============================================================================
-- Migration: 20261104000001_enterprise_plant_transit_core.sql
-- Description: Multi-tenant Vehicle Booking, QR Manifest & Attendance Engine
-- Platform: Supabase / PostgreSQL 15+
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. EXTENSIONS & CUSTOM ROUTING SCHEMA
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS app;

-- -----------------------------------------------------------------------------
-- 1. JWT IDENTITY & TENANCY HELPER FUNCTIONS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.current_site_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'site_id',
    NULLIF(current_setting('app.override_site_id', true), '')
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role',
    NULLIF(current_setting('app.override_role', true), ''),
    'ANONYMOUS'
  );
$$;

CREATE OR REPLACE FUNCTION app.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT app.current_role() = 'SUPER_ADMIN';
$$;

CREATE OR REPLACE FUNCTION app.is_plant_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT app.current_role() IN ('SUPER_ADMIN', 'PLANT_ADMIN');
$$;

-- -----------------------------------------------------------------------------
-- 2. ENUM TYPES
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE vehicle_category AS ENUM ('SEDAN_4', 'SUV_6', 'MINIBUS_20', 'BUS_42', 'BUS_52');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM ('ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_type AS ENUM ('PRIVATE', 'SHARED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('PENDING', 'APPROVED', 'DISPATCHED', 'COMPLETED', 'CANCELLED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE boarding_status AS ENUM ('AWAITING', 'BOARDED', 'NO_SHOW', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE check_in_mode AS ENUM ('QR_SELF_SCAN', 'DRIVER_MANUAL', 'ADMIN_OVERRIDE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3. CORE MULTI-TENANT TABLES
-- -----------------------------------------------------------------------------

-- 3.1 Sites / Plants Master (Tenant Isolation Anchor)
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_code VARCHAR(32) UNIQUE NOT NULL,
    site_name VARCHAR(128) NOT NULL,
    location_city VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    auto_allotment_enabled BOOLEAN NOT NULL DEFAULT false,
    require_admin_approval BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Drivers Master
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    license_number VARCHAR(64) NOT NULL,
    license_expiry DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_driver_mobile UNIQUE (site_id, mobile_number)
);

-- 3.3 Vehicles Inventory
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    registration_number VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    category vehicle_category NOT NULL,
    seat_capacity INTEGER NOT NULL CHECK (seat_capacity > 0),
    status vehicle_status NOT NULL DEFAULT 'ACTIVE',
    qr_code_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    qr_code_url VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_vehicle_reg UNIQUE (site_id, registration_number),
    CONSTRAINT uq_vehicle_qr_uuid UNIQUE (qr_code_uuid)
);

-- 3.4 Transport Bookings
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    booking_reference VARCHAR(32) NOT NULL,
    requester_id UUID NOT NULL REFERENCES auth.users(id),
    booking_type booking_type NOT NULL DEFAULT 'SHARED',
    origin_location TEXT NOT NULL,
    destination_location TEXT NOT NULL,
    scheduled_start_time TIMESTAMPTZ NOT NULL,
    scheduled_end_time TIMESTAMPTZ,
    status booking_status NOT NULL DEFAULT 'PENDING',
    target_category vehicle_category NOT NULL DEFAULT 'SEDAN_4',
    allotted_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    allotted_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    passenger_count INTEGER NOT NULL DEFAULT 1 CHECK (passenger_count > 0),
    purpose TEXT,
    rejection_reason TEXT,
    created_by_admin_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_booking_ref UNIQUE (site_id, booking_reference),
    CONSTRAINT chk_booking_dates CHECK (scheduled_end_time IS NULL OR scheduled_end_time >= scheduled_start_time)
);

-- 3.5 Trip Participants (Attendance & Occupancy Manifest)
CREATE TABLE IF NOT EXISTS trip_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(128) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    check_in_status boarding_status NOT NULL DEFAULT 'AWAITING',
    check_in_time TIMESTAMPTZ,
    check_in_mode check_in_mode,
    is_unscheduled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_booking_participant UNIQUE (booking_id, employee_id)
);

-- 3.6 Immutable Audit Logs (Fleet Actions & Overrides)
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    actor_id UUID,
    action VARCHAR(64) NOT NULL,
    entity_table VARCHAR(64) NOT NULL,
    entity_id UUID,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. PERFORMANCE & TENANCY INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_drivers_site ON drivers(site_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_site_status ON vehicles(site_id, status);
CREATE INDEX IF NOT EXISTS idx_vehicles_qr_uuid ON vehicles(qr_code_uuid);
CREATE INDEX IF NOT EXISTS idx_bookings_site_status ON bookings(site_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_requester ON bookings(site_id, requester_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dispatch_window ON bookings(allotted_vehicle_id, status, scheduled_start_time);
CREATE INDEX IF NOT EXISTS idx_participants_booking ON trip_participants(booking_id, check_in_status);
CREATE INDEX IF NOT EXISTS idx_participants_lookup ON trip_participants(site_id, employee_id, mobile_number);
CREATE INDEX IF NOT EXISTS idx_audit_logs_site ON audit_logs(site_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. AUTOMATED TRIGGERS & BUSINESS LOGIC ENFORCERS
-- -----------------------------------------------------------------------------

-- 5.1 Updated At Timestamp Auto-Setter
CREATE OR REPLACE FUNCTION app.fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();
CREATE TRIGGER trg_drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();
CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();
CREATE TRIGGER trg_participants_updated_at BEFORE UPDATE ON trip_participants FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();

-- 5.2 Strict Multi-Tenant Enforcement Trigger
-- Forces site_id to match session tenant token (unless caller is SUPER_ADMIN)
CREATE OR REPLACE FUNCTION app.fn_enforce_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_site UUID;
BEGIN
  IF app.is_super_admin() THEN
    RETURN NEW;
  END IF;

  v_session_site := app.current_site_id();
  IF v_session_site IS NULL THEN
    RAISE EXCEPTION 'Tenant site context missing in current authentication session.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.site_id := v_session_site;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.site_id <> OLD.site_id THEN
      RAISE EXCEPTION 'Illegal mutation of site_id across tenant boundary.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_drivers_tenant_guard BEFORE INSERT OR UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();
CREATE TRIGGER trg_vehicles_tenant_guard BEFORE INSERT OR UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();
CREATE TRIGGER trg_bookings_tenant_guard BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();
CREATE TRIGGER trg_participants_tenant_guard BEFORE INSERT OR UPDATE ON trip_participants FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

-- 5.3 Vehicle Seat Capacity Check vs Passenger Count
CREATE OR REPLACE FUNCTION app.fn_validate_booking_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_capacity INTEGER;
BEGIN
  IF NEW.allotted_vehicle_id IS NOT NULL THEN
    SELECT seat_capacity INTO v_capacity FROM vehicles WHERE id = NEW.allotted_vehicle_id;
    -- Capacity must account for vehicle driver (max passengers = capacity - 1)
    IF NEW.passenger_count > (v_capacity - 1) THEN
      RAISE EXCEPTION 'Passenger count (%) exceeds allowable passenger seats (%) for vehicle %',
        NEW.passenger_count, (v_capacity - 1), NEW.allotted_vehicle_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_booking_capacity BEFORE INSERT OR UPDATE OF allotted_vehicle_id, passenger_count ON bookings
FOR EACH ROW EXECUTE FUNCTION app.fn_validate_booking_capacity();

-- 5.4 Audit Logging Trigger
CREATE OR REPLACE FUNCTION app.fn_log_booking_state_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND (OLD.status <> NEW.status OR OLD.allotted_vehicle_id IS DISTINCT FROM NEW.allotted_vehicle_id)) THEN
    INSERT INTO audit_logs (site_id, actor_id, action, entity_table, entity_id, payload)
    VALUES (
      NEW.site_id,
      auth.uid(),
      'BOOKING_STATE_MUTATED',
      'bookings',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_vehicle', OLD.allotted_vehicle_id,
        'new_vehicle', NEW.allotted_vehicle_id,
        'timestamp', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_bookings AFTER UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION app.fn_log_booking_state_changes();

-- -----------------------------------------------------------------------------
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 6.1 SITES
CREATE POLICY "super_admin_manage_sites" ON sites FOR ALL TO authenticated
USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

CREATE POLICY "site_users_read_own_site" ON sites FOR SELECT TO authenticated
USING (id = app.current_site_id());

-- 6.2 DRIVERS
CREATE POLICY "super_admin_manage_drivers" ON drivers FOR ALL TO authenticated
USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_drivers" ON drivers FOR ALL TO authenticated
USING (site_id = app.current_site_id() AND app.is_plant_admin())
WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "site_users_view_active_drivers" ON drivers FOR SELECT TO authenticated
USING (site_id = app.current_site_id() AND is_active = true);

-- 6.3 VEHICLES
CREATE POLICY "super_admin_manage_vehicles" ON vehicles FOR ALL TO authenticated
USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_vehicles" ON vehicles FOR ALL TO authenticated
USING (site_id = app.current_site_id() AND app.is_plant_admin())
WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "site_users_view_active_vehicles" ON vehicles FOR SELECT TO authenticated
USING (site_id = app.current_site_id() AND status = 'ACTIVE');

-- 6.4 BOOKINGS
CREATE POLICY "super_admin_manage_bookings" ON bookings FOR ALL TO authenticated
USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_bookings" ON bookings FOR ALL TO authenticated
USING (site_id = app.current_site_id() AND app.is_plant_admin())
WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "requester_read_own_bookings" ON bookings FOR SELECT TO authenticated
USING (site_id = app.current_site_id() AND requester_id = auth.uid());

CREATE POLICY "requester_insert_own_bookings" ON bookings FOR INSERT TO authenticated
WITH CHECK (site_id = app.current_site_id() AND requester_id = auth.uid());

CREATE POLICY "requester_cancel_pending_bookings" ON bookings FOR UPDATE TO authenticated
USING (site_id = app.current_site_id() AND requester_id = auth.uid() AND status = 'PENDING')
WITH CHECK (site_id = app.current_site_id() AND requester_id = auth.uid() AND status = 'CANCELLED');

-- 6.5 TRIP PARTICIPANTS (Attendance & Unauthenticated Mobile QR Scan)
CREATE POLICY "super_admin_manage_participants" ON trip_participants FOR ALL TO authenticated
USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_participants" ON trip_participants FOR ALL TO authenticated
USING (site_id = app.current_site_id() AND app.is_plant_admin())
WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "requester_manage_booking_participants" ON trip_participants FOR ALL TO authenticated
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

CREATE POLICY "allow_driver_read_manifest" ON trip_participants FOR SELECT TO authenticated
USING (
  site_id = app.current_site_id() AND
  EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = trip_participants.booking_id
      AND b.status IN ('APPROVED', 'DISPATCHED')
  )
);

-- Public Policy for QR Code Scanning (Unauthenticated Mobile Landing Page)
CREATE POLICY "public_qr_attendance_update" ON trip_participants FOR UPDATE TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM bookings b
    JOIN vehicles v ON v.id = b.allotted_vehicle_id
    WHERE b.id = trip_participants.booking_id
      AND b.status IN ('APPROVED', 'DISPATCHED')
      AND v.qr_code_uuid = NULLIF(current_setting('app.scanned_qr_uuid', true), '')::uuid
  )
)
WITH CHECK (
  check_in_status IN ('BOARDED')
);

-- 6.6 AUDIT LOGS
CREATE POLICY "super_admin_read_all_audits" ON audit_logs FOR SELECT TO authenticated
USING (app.is_super_admin());

CREATE POLICY "plant_admin_read_site_audits" ON audit_logs FOR SELECT TO authenticated
USING (site_id = app.current_site_id() AND app.is_plant_admin());

-- -----------------------------------------------------------------------------
-- 7. IDEMPOTENT PRODUCTION SEED DATA
-- -----------------------------------------------------------------------------

-- 7.1 Seed Manufacturing Plants (Sites)
INSERT INTO sites (id, site_code, site_name, location_city, auto_allotment_enabled, require_admin_approval)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'PLANT_VADODARA', 'Vadodara Chemical Complex', 'Vadodara', true, true),
  ('22222222-2222-2222-2222-222222222222', 'PLANT_BHARUCH', 'Dahej Engineering Unit', 'Bharuch', false, true),
  ('33333333-3333-3333-3333-333333333333', 'PLANT_JAMNAGAR', 'Jamnagar Refinery Works', 'Jamnagar', true, false)
ON CONFLICT (site_code) DO UPDATE
SET site_name = EXCLUDED.site_name,
    auto_allotment_enabled = EXCLUDED.auto_allotment_enabled;

-- 7.2 Seed Plant Drivers
INSERT INTO drivers (id, site_id, name, mobile_number, license_number, license_expiry, is_active)
VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Ramesh Patel', '9825011111', 'GJ-06-2015-001234', '2030-12-31', true),
  ('d1111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111112', 'Sanjay Solanki', '9825022222', 'GJ-06-2018-005678', '2032-06-30', true),
  ('d2222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', 'Mohan Parmar', '9879033333', 'GJ-16-2017-009101', '2029-08-15', true)
ON CONFLICT (site_id, mobile_number) DO NOTHING;

-- 7.3 Seed Plant Vehicles (Cars, 4/6 Seaters, 42/52 Seater Buses)
INSERT INTO vehicles (id, site_id, registration_number, model, category, seat_capacity, status, qr_code_uuid, qr_code_url)
VALUES
  -- Vadodara Fleet
  ('v1111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', 'GJ-06-AX-1001', 'Maruti Dzire', 'SEDAN_4', 5, 'ACTIVE',
   'a0000000-0000-0000-0000-000000000001', 'https://transit.plant.internal/attend?vid=v1111111-1111-1111-1111-111111111101'),
  ('v1111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111111', 'GJ-06-BZ-2002', 'Toyota Innova Crysta', 'SUV_6', 7, 'ACTIVE',
   'a0000000-0000-0000-0000-000000000002', 'https://transit.plant.internal/attend?vid=v1111111-1111-1111-1111-111111111102'),
  ('v1111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111111', 'GJ-06-TR-3003', 'Tata Starbus Shift', 'BUS_42', 43, 'ACTIVE',
   'a0000000-0000-0000-0000-000000000003', 'https://transit.plant.internal/attend?vid=v1111111-1111-1111-1111-111111111103'),
  ('v1111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111111', 'GJ-06-TR-4004', 'Ashok Leyland Viking', 'BUS_52', 53, 'ACTIVE',
   'a0000000-0000-0000-0000-000000000004', 'https://transit.plant.internal/attend?vid=v1111111-1111-1111-1111-111111111104'),

  -- Bharuch Fleet
  ('v2222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222222', 'GJ-16-CK-5005', 'Mahindra Scorpio-N', 'SUV_6', 7, 'ACTIVE',
   'b0000000-0000-0000-0000-000000000001', 'https://transit.plant.internal/attend?vid=v2222222-2222-2222-2222-222222222201')
ON CONFLICT (site_id, registration_number) DO UPDATE
SET model = EXCLUDED.model,
    seat_capacity = EXCLUDED.seat_capacity;

COMMIT;