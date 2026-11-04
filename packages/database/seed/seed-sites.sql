-- =============================================================================
-- File: packages/database/seed/seed-sites.sql
-- Description: Idempotent Seed Data for Manufacturing Units, Gateway Integrations,
--              Site Administrators, and Employee User Rosters
-- Platform: Supabase / PostgreSQL 15+
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. SET ELEVATED SESSION PRIVILEGES
-- -----------------------------------------------------------------------------
-- Prevents trigger abort: 'Tenant site context missing in current authentication session.'
SET LOCAL app.override_role = 'SUPER_ADMIN';

-- -----------------------------------------------------------------------------
-- 1. SEED MANUFACTURING SITES (TENANTS)
-- -----------------------------------------------------------------------------
INSERT INTO sites (
  id,
  site_code,
  site_name,
  location_city,
  is_active,
  auto_allotment_enabled,
  require_admin_approval
) VALUES 
  (
    '11111111-1111-1111-1111-111111111111',
    'PLANT_VADODARA',
    'Vadodara Chemical & Polymer Complex',
    'Vadodara',
    true,
    true,   -- Auto vehicle allotment enabled
    true    -- Transport admin approval required
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'PLANT_BHARUCH',
    'Dahej Heavy Engineering Unit',
    'Bharuch',
    true,
    false,  -- Manual vehicle allotment by transport desk
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'PLANT_JAMNAGAR',
    'Jamnagar Coastal Refinery Works',
    'Jamnagar',
    true,
    true,   -- Auto vehicle allotment enabled
    false   -- Instant auto-approval enabled (no admin gate)
  )
ON CONFLICT (site_code) DO UPDATE
SET 
  site_name = EXCLUDED.site_name,
  location_city = EXCLUDED.location_city,
  auto_allotment_enabled = EXCLUDED.auto_allotment_enabled,
  require_admin_approval = EXCLUDED.require_admin_approval,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 2. SEED MESSAGING GATEWAYS & WEBHOOKS PER SITE
-- -----------------------------------------------------------------------------
-- Pre-configures WhatsApp Cloud API, DLT-Compliant SMS, and Email Relay.
INSERT INTO site_gateways (
  id,
  site_id,
  channel,
  is_enabled,
  provider_name,
  api_endpoint,
  auth_credentials,
  webhook_secret
) VALUES
  -- Vadodara: WhatsApp Business API (Meta Graph API)
  (
    'a1111111-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'WHATSAPP',
    true,
    'META_GRAPH_API',
    'https://graph.facebook.com/v20.0/PHONE_NUMBER_ID/messages',
    '{
      "phone_number_id": "104928392019283",
      "waba_id": "902184019284012",
      "template_namespace": "plant_transit_vadodara",
      "default_language": "en_US"
    }'::jsonb,
    'whsec_vadodara_meta_982401'
  ),

  -- Vadodara: India DLT-Registered Telecom SMS Gateway
  (
    'a1111111-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'SMS',
    true,
    'DLT_HTTP',
    'https://api.sms-provider.internal/v2/push',
    '{
      "sender_id": "PLNTRN",
      "entity_id": "1101492040000012345",
      "booking_template_id": "1107161234567890123",
      "cancel_template_id": "1107161234567890124"
    }'::jsonb,
    NULL
  ),

  -- Vadodara: Transactional Email Gateway (SMTP / Resend API)
  (
    'a1111111-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'EMAIL',
    true,
    'RESEND',
    'https://api.resend.com/emails',
    '{
      "from_address": "transit-vadodara@plant-logistics.company.com",
      "reply_to": "transport.vadodara@company.com"
    }'::jsonb,
    NULL
  ),

  -- Bharuch: WhatsApp Business API
  (
    'a2222222-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    'WHATSAPP',
    true,
    'META_GRAPH_API',
    'https://graph.facebook.com/v20.0/PHONE_NUMBER_ID/messages',
    '{
      "phone_number_id": "204928392019284",
      "waba_id": "902184019284013",
      "template_namespace": "plant_transit_dahej",
      "default_language": "en_US"
    }'::jsonb,
    'whsec_dahej_meta_554102'
  ),

  -- Bharuch: SMS Gateway
  (
    'a2222222-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'SMS',
    true,
    'DLT_HTTP',
    'https://api.sms-provider.internal/v2/push',
    '{
      "sender_id": "DHJTRN",
      "entity_id": "1101492040000012346",
      "booking_template_id": "1107161234567890125"
    }'::jsonb,
    NULL
  )
ON CONFLICT (site_id, channel) DO UPDATE
SET 
  is_enabled = EXCLUDED.is_enabled,
  api_endpoint = EXCLUDED.api_endpoint,
  auth_credentials = EXCLUDED.auth_credentials,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. MOCK AUTH.USERS (IF RUNNING IN STANDALONE POSTGRESQL / TESTING)
-- -----------------------------------------------------------------------------
-- In live Supabase environments, users exist in the `auth.users` table.
-- This block ensures foreign key validation passes during clean CI/CD runs.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  -- 1. Super Admin (Global Tenant Scope)
  (
    '00000000-0000-0000-0000-000000000001',
    'superadmin@company.com',
    crypt('SuperAdmin@2026', gen_salt('bf')),
    now(),
    '{"role": "SUPER_ADMIN", "site_id": null}'::jsonb,
    '{"full_name": "Enterprise Super Admin"}'::jsonb,
    now(),
    now()
  ),
  -- 2. Vadodara Plant Transport Admin
  (
    '00000000-0000-0000-0000-000000000002',
    'admin.vadodara@company.com',
    crypt('AdminVdr@2026', gen_salt('bf')),
    now(),
    '{"role": "PLANT_ADMIN", "site_id": "11111111-1111-1111-1111-111111111111"}'::jsonb,
    '{"full_name": "Jignesh Joshi"}'::jsonb,
    now(),
    now()
  ),
  -- 3. Bharuch Plant Transport Admin
  (
    '00000000-0000-0000-0000-000000000003',
    'admin.bharuch@company.com',
    crypt('AdminBh@2026', gen_salt('bf')),
    now(),
    '{"role": "PLANT_ADMIN", "site_id": "22222222-2222-2222-2222-222222222222"}'::jsonb,
    '{"full_name": "Hardik Shah"}'::jsonb,
    now(),
    now()
  ),
  -- 4. Vadodara Requester / Employee
  (
    '00000000-0000-0000-0000-000000000004',
    'dhaval.m@company.com',
    crypt('UserPass@2026', gen_salt('bf')),
    now(),
    '{"role": "REQUESTER", "site_id": "11111111-1111-1111-1111-111111111111"}'::jsonb,
    '{"full_name": "Dhaval Mungara"}'::jsonb,
    now(),
    now()
  ),
  -- 5. Bharuch Requester / Employee
  (
    '00000000-0000-0000-0000-000000000005',
    'chirag.p@company.com',
    crypt('UserPass@2026', gen_salt('bf')),
    now(),
    '{"role": "REQUESTER", "site_id": "22222222-2222-2222-2222-222222222222"}'::jsonb,
    '{"full_name": "Chirag Patel"}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE
SET 
  raw_app_meta_data = EXCLUDED.raw_app_meta_data,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data;

-- -----------------------------------------------------------------------------
-- 4. SEED SITE USERS MAPPING TABLE
-- -----------------------------------------------------------------------------
INSERT INTO site_users (
  id,
  user_id,
  site_id,
  role,
  employee_id,
  full_name,
  mobile_number,
  department,
  is_active
) VALUES
  -- Vadodara Plant Transport Desk Lead
  (
    'b1111111-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'PLANT_ADMIN',
    'ADM-VDR-01',
    'Jignesh Joshi',
    '9825000101',
    'Plant Logistics & Transport',
    true
  ),
  -- Vadodara Employee (IT & Network DevOps)
  (
    'b1111111-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'REQUESTER',
    'EMP-VDR-1042',
    'Dhaval Mungara',
    '9825000102',
    'IT & Automation Infrastructure',
    true
  ),
  -- Bharuch Plant Transport Desk Lead
  (
    'b2222222-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    '22222222-2222-2222-2222-222222222222',
    'PLANT_ADMIN',
    'ADM-DHJ-01',
    'Hardik Shah',
    '9879000201',
    'Plant Operations & Logistics',
    true
  ),
  -- Bharuch Employee (Mechanical Maintenance)
  (
    'b2222222-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000005',
    '22222222-2222-2222-2222-222222222222',
    'REQUESTER',
    'EMP-DHJ-2088',
    'Chirag Patel',
    '9879000202',
    'Mechanical Maintenance',
    true
  )
ON CONFLICT (site_id, user_id) DO UPDATE
SET 
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  mobile_number = EXCLUDED.mobile_number,
  department = EXCLUDED.department,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 5. RESET SESSION OVERRIDES
-- -----------------------------------------------------------------------------
RESET app.override_role;

COMMIT;