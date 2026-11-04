-- =============================================================================
-- Migration: 20261101000001_sites_and_tenancy.sql
-- Description: Core Tenancy Engine, Site Configurations, and System RLS Helpers
-- Platform: Supabase / PostgreSQL 15+
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS & SCHEMAS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS app;

-- -----------------------------------------------------------------------------
-- 2. JWT & TENANCY RESOLUTION FUNCTIONS (MIGRATION & SEED SAFE)
-- -----------------------------------------------------------------------------

-- Extract current active site_id from JWT claims or session override
CREATE OR REPLACE FUNCTION app.current_site_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'site_id',
    NULLIF(current_setting('app.override_site_id', true), '')
  )::uuid;
$$;

-- Extract current role from JWT claims or session override
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

-- Evaluates TRUE for DB superusers, service roles, and enterprise Super Admins
CREATE OR REPLACE FUNCTION app.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT 
    current_user IN ('postgres', 'supabase_admin', 'service_role')
    OR CURRENT_ROLE IN ('postgres', 'supabase_admin', 'service_role')
    OR app.current_role() = 'SUPER_ADMIN';
$$;

-- Evaluates TRUE for Super Admins and local Plant Transport Admins
CREATE OR REPLACE FUNCTION app.is_plant_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT app.is_super_admin() OR app.current_role() = 'PLANT_ADMIN';
$$;

-- -----------------------------------------------------------------------------
-- 3. CORE TENANCY TABLES
-- -----------------------------------------------------------------------------

-- 3.1 Sites Master Table (Isolated Manufacturing Units)
CREATE TABLE IF NOT EXISTS sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_code VARCHAR(32) UNIQUE NOT NULL,            -- e.g., 'PLANT_VADODARA', 'PLANT_BHARUCH'
    site_name VARCHAR(128) NOT NULL,
    location_city VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    auto_allotment_enabled BOOLEAN NOT NULL DEFAULT false,
    require_admin_approval BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Site Gateway & Webhook Configurations (Super Admin Managed)
CREATE TABLE IF NOT EXISTS site_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL,                    -- 'WHATSAPP', 'SMS', 'EMAIL', 'WEBHOOK'
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    provider_name VARCHAR(64) NOT NULL,              -- 'META_GRAPH_API', 'DLT_HTTP', 'RESEND', 'GENERIC_HOOK'
    api_endpoint VARCHAR(512),
    auth_credentials JSONB NOT NULL DEFAULT '{}'::jsonb, -- Encrypted API tokens, Sender IDs, headers
    webhook_secret VARCHAR(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_channel UNIQUE (site_id, channel)
);

-- 3.3 Site User Mappings & Profiles
CREATE TABLE IF NOT EXISTS site_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'REQUESTER',   -- 'SUPER_ADMIN', 'PLANT_ADMIN', 'DRIVER', 'REQUESTER'
    employee_id VARCHAR(64) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    department VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_user UNIQUE (site_id, user_id),
    CONSTRAINT uq_site_employee_id UNIQUE (site_id, employee_id)
);

-- -----------------------------------------------------------------------------
-- 4. PERFORMANCE & TENANCY INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sites_code ON sites(site_code);
CREATE INDEX IF NOT EXISTS idx_site_gateways_site ON site_gateways(site_id, channel);
CREATE INDEX IF NOT EXISTS idx_site_users_site ON site_users(site_id, role);
CREATE INDEX IF NOT EXISTS idx_site_users_auth_lookup ON site_users(user_id, site_id);

-- -----------------------------------------------------------------------------
-- 5. AUTOMATED TRIGGERS & INTEGRITY GUARDS
-- -----------------------------------------------------------------------------

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION app.fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();

CREATE TRIGGER trg_site_gateways_updated_at
  BEFORE UPDATE ON site_gateways
  FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();

CREATE TRIGGER trg_site_users_updated_at
  BEFORE UPDATE ON site_users
  FOR EACH ROW EXECUTE FUNCTION app.fn_set_updated_at();

-- Enforce site_id integrity for tenant tables
CREATE OR REPLACE FUNCTION app.fn_enforce_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_site UUID;
BEGIN
  -- Bypass check for super admin, direct SQL Editor, or CLI migration executions
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

CREATE TRIGGER trg_site_gateways_tenant_guard
  BEFORE INSERT OR UPDATE ON site_gateways
  FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

CREATE TRIGGER trg_site_users_tenant_guard
  BEFORE INSERT OR UPDATE ON site_users
  FOR EACH ROW EXECUTE FUNCTION app.fn_enforce_tenant_integrity();

-- -----------------------------------------------------------------------------
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_users ENABLE ROW LEVEL SECURITY;

-- 6.1 SITES
CREATE POLICY "super_admin_manage_sites"
  ON sites FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY "site_users_view_own_site"
  ON sites FOR SELECT TO authenticated
  USING (id = app.current_site_id());

-- 6.2 SITE GATEWAYS (Secrets restricted to Super Admin & Plant Admin)
CREATE POLICY "super_admin_manage_gateways"
  ON site_gateways FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_view_gateways"
  ON site_gateways FOR SELECT TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin());

-- 6.3 SITE USERS
CREATE POLICY "super_admin_manage_site_users"
  ON site_users FOR ALL TO authenticated
  USING (app.is_super_admin())
  WITH CHECK (app.is_super_admin());

CREATE POLICY "plant_admin_manage_site_users"
  ON site_users FOR ALL TO authenticated
  USING (site_id = app.current_site_id() AND app.is_plant_admin())
  WITH CHECK (site_id = app.current_site_id() AND app.is_plant_admin());

CREATE POLICY "users_view_coworkers_in_site"
  ON site_users FOR SELECT TO authenticated
  USING (site_id = app.current_site_id() AND is_active = true);

CREATE POLICY "users_update_own_profile"
  ON site_users FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND site_id = app.current_site_id())
  WITH CHECK (user_id = auth.uid() AND site_id = app.current_site_id());

COMMIT;