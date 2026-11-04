-- =============================================================================
-- File: packages/database/seed/seed-vehicles.sql
-- Description: Idempotent Seed Data for Drivers, Multi-Category Fleet Inventory,
--              and Pre-Computed Cryptographic QR Decals (Valid Hex UUIDs)
-- Dependencies: packages/database/seed/seed-sites.sql
-- Platform: Supabase / PostgreSQL 15+
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. SET ELEVATED SESSION PRIVILEGES
-- -----------------------------------------------------------------------------
SET LOCAL app.override_role = 'SUPER_ADMIN';

-- -----------------------------------------------------------------------------
-- 1. SEED DRIVERS ACROSS MANUFACTURING PLANTS
-- -----------------------------------------------------------------------------
INSERT INTO drivers (
  id,
  site_id,
  name,
  mobile_number,
  license_number,
  license_expiry,
  duty_status,
  is_active
) VALUES
  -- Vadodara Drivers (Site: 11111111-1111-1111-1111-111111111111)
  (
    'd1111111-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'Ramesh Patel',
    '9825011111',
    'GJ-06-2015-001234',
    '2030-12-31',
    'AVAILABLE',
    true
  ),
  (
    'd1111111-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'Sanjay Solanki',
    '9825022222',
    'GJ-06-2018-005678',
    '2032-06-30',
    'AVAILABLE',
    true
  ),
  (
    'd1111111-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'Mukesh Vaghela',
    '9825033333',
    'GJ-06-2012-009988',
    '2028-03-31',
    'AVAILABLE',
    true
  ),
  (
    'd1111111-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'Gopal Bharwad',
    '9825044444',
    'GJ-06-2010-004411',
    '2027-11-30',
    'AVAILABLE',
    true
  ),

  -- Bharuch / Dahej Drivers (Site: 22222222-2222-2222-2222-222222222222)
  (
    'd2222222-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    'Mohan Parmar',
    '9879011111',
    'GJ-16-2017-009101',
    '2029-08-15',
    'AVAILABLE',
    true
  ),
  (
    'd2222222-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'Pravin Vasava',
    '9879022222',
    'GJ-16-2019-003322',
    '2033-01-20',
    'AVAILABLE',
    true
  ),

  -- Jamnagar Drivers (Site: 33333333-3333-3333-3333-333333333333)
  (
    'd3333333-0000-0000-0000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    'Jayesh Jadeja',
    '9898011111',
    'GJ-10-2016-007788',
    '2031-09-10',
    'AVAILABLE',
    true
  )
ON CONFLICT (site_id, mobile_number) DO UPDATE
SET 
  name = EXCLUDED.name,
  license_number = EXCLUDED.license_number,
  license_expiry = EXCLUDED.license_expiry,
  duty_status = EXCLUDED.duty_status,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 2. SEED VEHICLES WITH VALID HEXADECIMAL UUIDS & CRYPTOGRAPHIC QR DECALS
-- -----------------------------------------------------------------------------
-- HMAC-SHA256 Secret: 'plant_transit_secret_key_2026'
-- Canonical Payload: '<vehicle_id>:<site_id>'
INSERT INTO vehicles (
  id,
  site_id,
  registration_number,
  model,
  category,
  seat_capacity,
  status,
  default_driver_id,
  qr_code_uuid,
  qr_code_url,
  qr_generated_at,
  qr_version
) VALUES
  -- ---------------------------------------------------------------------------
  -- VADODARA PLANT FLEET (Site: 11111111-1111-1111-1111-111111111111)
  -- ---------------------------------------------------------------------------
  -- 1. Sedan (4 Passenger Seats + 1 Driver = 5)
  (
    '10000000-0000-0000-0000-000000000001',
    '11111111-1111-1111-1111-111111111111',
    'GJ-06-AX-1001',
    'Maruti Suzuki Dzire VXi',
    'SEDAN_4',
    5,
    'ACTIVE',
    'd1111111-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'https://transit.plant.internal/attend?vid=10000000-0000-0000-0000-000000000001&s=' || 
      encode(hmac('10000000-0000-0000-0000-000000000001:11111111-1111-1111-1111-111111111111', 'plant_transit_secret_key_2026', 'sha256'), 'hex'),
    now(),
    1
  ),

  -- 2. SUV (6 Passenger Seats + 1 Driver = 7)
  (
    '10000000-0000-0000-0000-000000000002',
    '11111111-1111-1111-1111-111111111111',
    'GJ-06-BZ-2002',
    'Toyota Innova Crysta 2.4 VX',
    'SUV_6',
    7,
    'ACTIVE',
    'd1111111-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'https://transit.plant.internal/attend?vid=10000000-0000-0000-0000-000000000002&s=' || 
      encode(hmac('10000000-0000-0000-0000-000000000002:11111111-1111-1111-1111-111111111111', 'plant_transit_secret_key_2026', 'sha256'), 'hex'),
    now(),
    1
  ),

  -- 3. Minibus (20 Passenger Seats + 1 Driver = 21)
  (
    '10000000-0000-0000-0000-000000000003',
    '11111111-1111-1111-1111-111111111111',
    'GJ-06-CR-3003',
    'Force Traveller 20-Seater AC',
    'MINIBUS_20',
    21,
    'ACTIVE',
    'd1111111-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    'https://transit.plant.internal/attend?vid=10000000-0000-0000-0000-000000000003&s=' || 
      encode(hmac('10000000-0000-0000-0000-000000000003:11111111-1111-1111-1111-111111111111', 'plant_transit_secret_key_2026', 'sha256'), 'hex'),
    now(),
    1
  ),

  -- 4. Shift Bus 42 (42 Passenger Seats + 1 Driver = 43)
  (
    '10000000-0000-0000-0000-000000000004',
    '11111111-1111-1111-1111-111111111111',
    'GJ-06-TR-4004',
    'Tata Starbus Shift 42-Seater',
    'BUS_42',
    43,
    'ACTIVE',
    'd1111111-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000004',
    'https://transit.plant.internal/attend?vid=10000000-0000-0000-0000-000000000004&s=' || 
      encode(hmac('10000000-0000-0000-0000-000000000004:11111111-1111-1111-1111-111111111111', 'plant_transit_secret_key_2026', 'sha256'), 'hex'),
    now(),
    1
  ),

  -- 5. Plant Shift Bus 52 (52 Passenger Seats + 1 Driver = 53)
  (
    '10000000-0000-0000-0000-000000000005',
    '11111111-1111-1111-1111-111111111111',
    'GJ-06-TR-5005',
    'Ashok Leyland Viking 52-Seater',
    'BUS_52',
    53,
    'ACTIVE',
    NULL,
    'a0000000-0000-0000-0000-000000000005',
    'https://transit.plant.internal/attend?vid=10000000-0000-0000-0000-000000000005&s=' || 
      encode(hmac('10000000-0000-0000-0000-000000000005:11111111-1111-1111-1111-111111111111', 'plant_transit_secret_key_2026', 'sha256'), 'hex'),
    now(),
    1
  ),

  -- ---------------------------------------------------------------------------
  -- BHARUCH / DAHEJ PLANT FLEET (Site: 22222222-2222-2222-2222-222222222222)
  -- ---------------------------------------------------------------------------
  -- 6. SUV (6 Passenger Seats + 1 Driver = 7)
  (
    '20000000-0000-0000-0000-000000000001',
    '22222222-2222-2222-2222-222222222222',
    'GJ-16-CK-5001',
    'Mahindra Scorpio-N Z8',
    'SUV_6',
    7,
    'ACTIVE',
    'd2222222-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'https://transit.plant.internal/attend?vid=20000000-0000-0000-0000-000000000001&s=' || 
      encode(hmac('20000000-0000-0000-0000-000000000001:22222222-2222-2222-2222-222222222222', 'plant_transit_secret_key_2026', 'sha256'), 'hex'),
    now(),
    1
  ),

  -- 7. Shift Bus 42 (42 Passenger Seats + 1 Driver = 43)
  (
    '20000000-0000-0000-0000-000000000002',
    '22222222-2222-2222-2222-222222222222',
    'GJ-16-TR-6002',
    'Tata Starbus Shift 42-Seater',
    'BUS_42',
    43,
    'ACTIVE',
    'd2222222-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'https://transit.plant.internal/attend?vid=20000000-0000-0000-0000-000000000002&s=' || 
      encode(hmac('20000000-0000-0000-0000-000000000002:22222222-2222-2222-2222-222222222222', 'plant_transit_secret_key_2026', 'sha256'), 'hex'),
    now(),
    1
  ),

  -- ---------------------------------------------------------------------------
  -- JAMNAGAR PLANT FLEET (Site: 33333333-3333-3333-3333-333333333333)
  -- ---------------------------------------------------------------------------
  -- 8. Sedan (4 Passenger Seats + 1 Driver = 5)
  (
    '30000000-0000-0000-0000-000000000001',
    '33333333-3333-3333-3333-333333333333',
    'GJ-10-DF-7001',
    'Hyundai Aura S CNG',
    'SEDAN_4',
    5,
    'ACTIVE',
    'd3333333-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'https://transit.plant.internal/attend?vid=30000000-0000-0000-0000-000000000001&s=' || 
      encode(hmac('30000000-0000-0000-0000-000000000001:33333333-3333-3333-3333-333333333333', 'plant_transit_secret_key_2026', 'sha256'), 'hex'),
    now(),
    1
  )
ON CONFLICT (site_id, registration_number) DO UPDATE
SET 
  model = EXCLUDED.model,
  category = EXCLUDED.category,
  seat_capacity = EXCLUDED.seat_capacity,
  status = EXCLUDED.status,
  default_driver_id = EXCLUDED.default_driver_id,
  qr_code_uuid = EXCLUDED.qr_code_uuid,
  qr_code_url = EXCLUDED.qr_code_url,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. RESET SESSION OVERRIDES
-- -----------------------------------------------------------------------------
RESET app.override_role;

COMMIT;