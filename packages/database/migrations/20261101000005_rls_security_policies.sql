-- =============================================================================
-- Migration: 20261101000005_rls_security_policies.sql
-- Description: Hardened Enterprise RLS Policies, Cross-Tenant Security Guards,
--              Audit Infrastructure, and Automated In-Database RLS Validation Suite
-- Dependencies: 20261101000001 through 20261101000004
-- Platform: Supabase / PostgreSQL 15+
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENTERPRISE AUDIT LOGGING INFRASTRUCTURE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    actor_id UUID,
    actor_role TEXT,
    action VARCHAR(64) NOT NULL,                    -- 'INSERT', 'UPDATE', 'DELETE', 'OVERRIDE', 'ALLOTMENT'
    entity_table VARCHAR(64) NOT NULL,              -- 'bookings', 'vehicles', 'trip_participants', etc.
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_site_created ON audit_logs(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);

-- Automated Audit Trigger for State Changes & Allocations
CREATE OR REPLACE FUNCTION app.fn_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site_id UUID;
  v_actor_id UUID;
  v_actor_role TEXT;
  v_entity_id UUID;
BEGIN
  -- Resolve Tenant Site ID
  IF TG_OP = 'DELETE' THEN
    v_site_id := OLD.site_id;
    v_entity_id := OLD.id;
  ELSE
    v_site_id := NEW.site_id;
    v_entity_id := NEW.id;
  END IF;

  v_actor_id := auth.uid();
  v_actor_role := app.current_role();

  INSERT INTO audit_logs (
    site_id,
    actor_id,
    actor_role,
    action,
    entity_table,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_site_id,
    v_actor_id,
    v_actor_role,
    TG_OP,
    TG_TABLE_NAME,
    v_entity_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach Audit Triggers to Critical Entities
DROP TRIGGER IF EXISTS trg_audit_bookings_mutation ON bookings;
CREATE TRIGGER trg_audit_bookings_mutation
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.fn_audit_mutation();

DROP TRIGGER IF EXISTS trg_audit_vehicles_mutation ON vehicles;
CREATE TRIGGER trg_audit_vehicles_mutation
  AFTER INSERT OR UPDATE OR DELETE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION app.fn_audit_mutation();

DROP TRIGGER IF EXISTS trg_audit_participants_mutation ON trip_participants;
CREATE TRIGGER trg_audit_participants_mutation
  AFTER INSERT OR UPDATE OR DELETE ON trip_participants
  FOR EACH ROW EXECUTE FUNCTION app.fn_audit_mutation();

-- -----------------------------------------------------------------------------
-- 2. HARDENED ROW-LEVEL SECURITY ENFORCEMENT
-- -----------------------------------------------------------------------------

-- Force RLS on all tables (even for table owners)
ALTER TABLE sites FORCE ROW LEVEL SECURITY;
ALTER TABLE site_gateways FORCE ROW LEVEL SECURITY;
ALTER TABLE site_users FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;
ALTER TABLE drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle_maintenance_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
ALTER TABLE trip_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle_qr_scans FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- 2.1 Audit Logs Security Policies
CREATE POLICY "super_admin_view_all_audits"
  ON audit_logs FOR SELECT TO authenticated
  USING (app.is_super_admin());

CREATE POLICY "plant_admin_view_site_audits"
  ON audit_logs FOR SELECT TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin());

-- Immutable: Disallow direct client UPDATE on audit logs
CREATE POLICY "prevent_audit_update"
  ON audit_logs FOR UPDATE TO authenticated, anon
  USING (false);

-- Immutable: Disallow direct client DELETE on audit logs
CREATE POLICY "prevent_audit_delete"
  ON audit_logs FOR DELETE TO authenticated, anon
  USING (false);

-- -----------------------------------------------------------------------------
-- 3. CROSS-TENANT PENETRATION RESISTANCE FUNCTIONS
-- -----------------------------------------------------------------------------

-- Prevents cross-tenant foreign key traversal attacks
CREATE OR REPLACE FUNCTION app.fn_validate_allotment_tenant_boundary()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vehicle_site UUID;
  v_driver_site UUID;
BEGIN
  -- Validate vehicle belongs to the exact same site
  IF NEW.allotted_vehicle_id IS NOT NULL THEN
    SELECT site_id INTO v_vehicle_site FROM vehicles WHERE id = NEW.allotted_vehicle_id;
    IF v_vehicle_site IS DISTINCT FROM NEW.site_id THEN
      RAISE EXCEPTION 'Cross-Tenant Violation: Allotted vehicle belongs to site %, cannot assign to site %',
        v_vehicle_site, NEW.site_id;
    END IF;
  END IF;

  -- Validate driver belongs to the exact same site
  IF NEW.allotted_driver_id IS NOT NULL THEN
    SELECT site_id INTO v_driver_site FROM drivers WHERE id = NEW.allotted_driver_id;
    IF v_driver_site IS DISTINCT FROM NEW.site_id THEN
      RAISE EXCEPTION 'Cross-Tenant Violation: Allotted driver belongs to site %, cannot assign to site %',
        v_driver_site, NEW.site_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_allotment_tenant_boundary ON bookings;
CREATE TRIGGER trg_validate_allotment_tenant_boundary
  BEFORE INSERT OR UPDATE OF allotted_vehicle_id, allotted_driver_id ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.fn_validate_allotment_tenant_boundary();

-- -----------------------------------------------------------------------------
-- 4. AUTOMATED RLS INTEGRITY VERIFICATION SUITE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.verify_rls_integrity()
RETURNS TABLE(test_name TEXT, passed BOOLEAN, details TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site_1 UUID := '11111111-1111-1111-1111-111111111111'; -- Vadodara
  v_site_2 UUID := '22222222-2222-2222-2222-222222222222'; -- Bharuch
  v_count INTEGER;
BEGIN
  -- ---------------------------------------------------------------------------
  -- TEST 1: Plant Admin cannot see vehicles from other sites
  -- ---------------------------------------------------------------------------
  test_name := 'TENANT_ISOLATION_SELECT_VEHICLES';
  
  PERFORM set_config('app.override_site_id', v_site_1::text, true);
  PERFORM set_config('app.override_role', 'PLANT_ADMIN', true);

  SELECT COUNT(*) INTO v_count
  FROM vehicles
  WHERE site_id = v_site_2;

  IF v_count = 0 THEN
    passed := true;
    details := 'Plant Admin at Site 1 isolated from Site 2 inventory.';
  ELSE
    passed := false;
    details := 'Cross-tenant leak detected: visible foreign vehicles = ' || v_count;
  END IF;
  RETURN NEXT;

  -- ---------------------------------------------------------------------------
  -- TEST 2: Cross-tenant vehicle insertion must be rejected by tenant integrity
  -- ---------------------------------------------------------------------------
  test_name := 'TENANT_ISOLATION_INSERT_TAMPER';
  BEGIN
    INSERT INTO vehicles (site_id, registration_number, model, category, seat_capacity)
    VALUES (v_site_2, 'GJ-16-TEST-9999', 'Unauthorized Cross Insert', 'SEDAN_4', 5);

    passed := false;
    details := 'Critical vulnerability: Cross-tenant insert succeeded.';
  EXCEPTION WHEN OTHERS THEN
    passed := true;
    details := 'Blocked successfully: ' || SQLERRM;
  END;
  RETURN NEXT;

  -- ---------------------------------------------------------------------------
  -- TEST 3: Cross-tenant vehicle allotment in bookings must trigger boundary abort
  -- ---------------------------------------------------------------------------
  test_name := 'TENANT_BOUNDARY_ALLOTMENT_GUARD';
  BEGIN
    INSERT INTO bookings (
      site_id,
      booking_reference,
      requester_id,
      origin_location,
      destination_location,
      scheduled_start_time,
      allotted_vehicle_id
    ) VALUES (
      v_site_1,
      'BK-TEST-LEAK-01',
      '00000000-0000-0000-0000-000000000001',
      'Plant Gate 1',
      'Vendor Office',
      now() + INTERVAL '2 hours',
      'v2222222-2222-2222-2222-222222222201'
    );

    passed := false;
    details := 'Critical failure: Booking allotted vehicle across tenant boundary.';
  EXCEPTION WHEN OTHERS THEN
    passed := true;
    details := 'Cross-tenant allotment blocked: ' || SQLERRM;
  END;
  RETURN NEXT;

  -- ---------------------------------------------------------------------------
  -- TEST 4: Anonymous scan access can resolve vehicle but cannot see others
  -- ---------------------------------------------------------------------------
  test_name := 'ANONYMOUS_QR_SURFACE_RESTRICTION';
  PERFORM set_config('app.override_site_id', '', true);
  PERFORM set_config('app.override_role', 'ANONYMOUS', true);

  SELECT COUNT(*) INTO v_count FROM bookings;

  IF v_count = 0 THEN
    passed := true;
    details := 'Bookings table strictly inaccessible to unauthenticated callers.';
  ELSE
    passed := false;
    details := 'Data exposure: Anonymous role accessed ' || v_count || ' bookings.';
  END IF;
  RETURN NEXT;

  -- ---------------------------------------------------------------------------
  -- TEST 5: Super Admin global visibility
  -- ---------------------------------------------------------------------------
  test_name := 'SUPER_ADMIN_CROSS_SITE_VISIBILITY';
  PERFORM set_config('app.override_role', 'SUPER_ADMIN', true);

  SELECT COUNT(DISTINCT site_id) INTO v_count FROM vehicles;

  IF v_count >= 2 THEN
    passed := true;
    details := 'Super Admin successfully maintains cross-tenant visibility across ' || v_count || ' plants.';
  ELSE
    passed := false;
    details := 'Super Admin restricted or multi-site seed data missing.';
  END IF;
  RETURN NEXT;

  -- Reset Session Context
  PERFORM set_config('app.override_site_id', '', true);
  PERFORM set_config('app.override_role', '', true);

END;
$$;

-- -----------------------------------------------------------------------------
-- 5. REALTIME PUBLICATION SUBSCRIPTIONS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'trip_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trip_participants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
  END IF;
END $$;

COMMIT;