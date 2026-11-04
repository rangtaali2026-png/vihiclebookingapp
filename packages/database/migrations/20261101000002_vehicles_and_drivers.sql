-- =============================================================================
-- Migration: 20261101000002_vehicles_and_drivers.sql
-- Description: Fleet Management, Vehicle Inventory, Drivers, and QR Decal Engine
-- Dependencies: 20261101000001_sites_and_tenancy.sql
-- Platform: Supabase / PostgreSQL 15+
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENUMS FOR FLEET CLASSIFICATION & STATUS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE vehicle_category AS ENUM (
    'SEDAN_4',     -- 4 passenger seats + 1 driver (Total: 5)
    'SUV_6',       -- 6 passenger seats + 1 driver (Total: 7)
    'MINIBUS_20',  -- 20 passenger seats + 1 driver (Total: 21)
    'BUS_42',      -- 42 passenger seats + 1 driver (Total: 43)
    'BUS_52'       -- 52 passenger seats + 1 driver (Total: 53)
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_status AS ENUM (
    'ACTIVE',
    'MAINTENANCE',
    'DECOMMISSIONED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE driver_duty_status AS ENUM (
    'AVAILABLE',
    'ON_TRIP',
    'OFF_DUTY',
    'LEAVE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. CORE FLEET TABLES
-- -----------------------------------------------------------------------------

-- 2.1 Drivers Master Table
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    license_number VARCHAR(64) NOT NULL,
    license_expiry DATE NOT NULL,
    duty_status driver_duty_status NOT NULL DEFAULT 'AVAILABLE',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_driver_mobile UNIQUE (site_id, mobile_number),
    CONSTRAINT uq_site_driver_license UNIQUE (site_id, license_number)
);

-- 2.2 Vehicle Inventory Table
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    registration_number VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    category vehicle_category NOT NULL,
    seat_capacity INTEGER NOT NULL CHECK (seat_capacity > 0),
    status vehicle_status NOT NULL DEFAULT 'ACTIVE',
    default_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    
    -- Dedicated Cryptographic QR Decal Columns
    qr_code_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    qr_code_url VARCHAR(512),
    qr_generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    qr_version INTEGER NOT NULL DEFAULT 1,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_vehicle_reg UNIQUE (site_id, registration_number),
    CONSTRAINT uq_vehicle_qr_uuid UNIQUE (qr_code_uuid)
);

-- 2.3 Vehicle Maintenance & Inspection Logs
CREATE TABLE IF NOT EXISTS vehicle_maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    maintenance_type VARCHAR(64) NOT NULL,          -- 'SCHEDULED_SERVICE', 'REPAIR', 'INSPECTION'
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    odometer_reading INTEGER,
    cost NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. PERFORMANCE & LOOKUP INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_drivers_site_status ON drivers(site_id, is_active, duty_status);
CREATE INDEX IF NOT EXISTS idx_drivers_mobile ON drivers(mobile_number);

CREATE INDEX IF NOT EXISTS idx_vehicles_site_category ON vehicles(site_id, category, status);
CREATE INDEX IF NOT EXISTS idx_vehicles_qr_uuid ON vehicles(qr_code_uuid);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle ON vehicle_maintenance_logs(site_id, vehicle_id);

-- -----------------------------------------------------------------------------
-- 4. AUTOMATED TRIGGERS & BUSINESS LOGIC
-- -----------------------------------------------------------------------------

-- 4.1 Updated At Timestamp Auto-Setter
CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();

CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();

-- 4.2 Multi-Tenant Integrity Guards
CREATE TRIGGER trg_drivers_tenant_guard
  BEFORE INSERT OR UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

CREATE TRIGGER trg_vehicles_tenant_guard
  BEFORE INSERT OR UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

CREATE TRIGGER trg_maintenance_tenant_guard
  BEFORE INSERT OR UPDATE ON vehicle_maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

-- 4.3 QR URL Auto-Populator on Vehicle Insert / Regeneration
CREATE OR REPLACE FUNCTION app.fn_generate_vehicle_qr_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Default redirect URL formatting pointing to zero-login check-in route
  IF NEW.qr_code_url IS NULL OR NEW.qr_code_uuid <> OLD.qr_code_uuid THEN
    NEW.qr_code_url := '/attend?vid=' || NEW.id::text || '&qr=' || NEW.qr_code_uuid::text;
    NEW.qr_generated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vehicles_qr_metadata
  BEFORE INSERT OR UPDATE OF qr_code_uuid ON vehicles
  FOR EACH ROW EXECUTE FUNCTION app.fn_generate_vehicle_qr_metadata();

-- 4.4 Automated Sync of Vehicle Status upon Maintenance Entry
CREATE OR REPLACE FUNCTION app.fn_sync_vehicle_maintenance_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.end_date IS NULL THEN
    UPDATE vehicles 
    SET status = 'MAINTENANCE', updated_at = now()
    WHERE id = NEW.vehicle_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.end_date IS NOT NULL AND OLD.end_date IS NULL THEN
    UPDATE vehicles 
    SET status = 'ACTIVE', updated_at = now()
    WHERE id = NEW.vehicle_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_maintenance_status
  AFTER INSERT OR UPDATE ON vehicle_maintenance_logs
  FOR EACH ROW EXECUTE FUNCTION app.fn_sync_vehicle_maintenance_status();

-- -----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_maintenance_logs ENABLE ROW LEVEL SECURITY;

-- 5.1 DRIVERS RLS
CREATE POLICY "super_admin_all_drivers"
  ON drivers FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_drivers"
  ON drivers FOR ALL TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin())
  WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "site_staff_view_drivers"
  ON drivers FOR SELECT TO authenticated
  USING (site_id = app.current_site_id() AND is_active = true);

-- 5.2 VEHICLES RLS
CREATE POLICY "super_admin_all_vehicles"
  ON vehicles FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_vehicles"
  ON vehicles FOR ALL TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin())
  WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "site_staff_view_active_vehicles"
  ON vehicles FOR SELECT TO authenticated
  USING (site_id = app.current_site_id() AND status = 'ACTIVE');

-- Public Scan Lookups (Resolving QR metadata on unauthenticated scan landing)
CREATE POLICY "public_anon_qr_vehicle_lookup"
  ON vehicles FOR SELECT TO anon
  USING (status = 'ACTIVE');

-- 5.3 VEHICLE MAINTENANCE LOGS RLS
CREATE POLICY "super_admin_all_maintenance"
  ON vehicle_maintenance_logs FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_maintenance"
  ON vehicle_maintenance_logs FOR ALL TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin())
  WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

COMMIT;