# Multi-Tenant Architecture & Row-Level Security (RLS) Specification

**Environment:** Supabase (PostgreSQL 15+)

**Tenancy Model:** Shared Database, Shared Schema with Logical Isolation via Row-Level Security (`site_id`)

**Target Context:** Enterprise Manufacturing Plants (e.g., Plant 1 – Vadodara, Plant 2 – Bharuch, Corporate Transit)

---

## 1. Tenancy Model Strategy

In multi-tenant industrial systems, three core database separation models exist:

| Model | Isolation Mechanism | Operational Trade-Off | Verdict for Plant Fleet System |
| --- | --- | --- | --- |
| **Database-per-tenant** | Dedicated DB instance per plant | High infrastructure cost, nightmare schema migrations across 20+ plants. | Overkill; rejected. |
| **Schema-per-tenant** | Dedicated Postgres schema per plant (`site_vadodara.bookings`) | Complex connection routing, cross-site reporting requires dynamic SQL unions. | High maintenance; rejected. |
| **Shared Schema + RLS** | Single schema; every table carries indexed `site_id` filtered by PostgreSQL RLS | Zero migration overhead, hardware-level isolation inside Postgres engine, unified cross-site Super Admin reporting. | **Selected Architecture.** |

Row-Level Security (RLS) acts as a persistent, hardware-enforced `WHERE site_id = current_tenant()` appended to **every** query, mutation, join, and trigger, independent of what the frontend or API specifies. Even if a compromised client attempts `SELECT * FROM vehicles;`, the PostgreSQL kernel only evaluates and returns rows belonging to that user's authorized plant.

---

## 2. PostgreSQL Identity Resolution Architecture

To make RLS performant at scale, the database must identify the caller’s `site_id` and `role` without running an expensive join to the users table on every single row check.

```
+-----------------------------------------------------------------------------------------+
| Client Request (Browser / Wrapped Mobile App / QR Page)                                 |
+-------------------------------------------+---------------------------------------------+
                                            |
                                            | (Bearer JWT Token with Custom Claims)
                                            v
+-----------------------------------------------------------------------------------------+
| Supabase / Cloudflare Worker Gateway                                                    |
| - Extracts JWT: { sub: "usr_101", app_metadata: { site_id: "site_baroda", role: "admin" } } |
| - Passes token to PostgreSQL connection                                                 |
+-------------------------------------------+---------------------------------------------+
                                            |
                                            v
+-----------------------------------------------------------------------------------------+
| PostgreSQL Engine (Execution Context)                                                   |
|                                                                                         |
|  1. Helper Functions:                                                                   |
|     - auth.uid()                  -> User UUID                                          |
|     - app.current_site_id()       -> (auth.jwt() -> 'app_metadata' ->> 'site_id')::uuid |
|     - app.current_role()          -> (auth.jwt() -> 'app_metadata' ->> 'role')::text    |
|                                                                                         |
|  2. RLS Filter Engine (Evaluated at Kernel Level):                                       |
|     Incoming: SELECT * FROM bookings;                                                   |
|     Executed: SELECT * FROM bookings WHERE site_id = app.current_site_id();             |
+-----------------------------------------------------------------------------------------+

```

---

## 3. Production PostgreSQL Schema & Helper Functions

### 3.1 Tenant Context Helper Functions

These helper functions inspect the signed JWT metadata issued by Supabase Auth or Cloudflare Workers. Marking them `STABLE` ensures PostgreSQL caches the evaluated token value for the entire query execution rather than re-evaluating it for every scanned row.

```sql
-- Create custom schema for internal tenancy routing
CREATE SCHEMA IF NOT EXISTS app;

-- Extract Site UUID from JWT app_metadata
CREATE OR REPLACE FUNCTION app.current_site_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'site_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

-- Extract Role from JWT app_metadata
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'role',
    'anonymous'
  );
$$;

-- Helper to check if current actor is Super Admin
CREATE OR REPLACE FUNCTION app.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT app.current_role() = 'SUPER_ADMIN';
$$;

```

---

### 3.2 Core Multi-Tenant Tables

Every operational entity enforces a foreign key back to the `sites` master table.

```sql
-- 1. Sites Master (Tenants)
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_code VARCHAR(32) UNIQUE NOT NULL,      -- e.g., 'PLANT_VADODARA', 'PLANT_BHARUCH'
    site_name VARCHAR(128) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    auto_allotment_enabled BOOLEAN NOT NULL DEFAULT false,
    require_admin_approval BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Vehicle Inventory (Car, SUV, 42/52 Seater Bus)
CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    registration_number VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    seat_capacity INTEGER NOT NULL CHECK (seat_capacity > 0),
    category VARCHAR(32) NOT NULL,              -- 'SEDAN_4', 'SUV_6', 'BUS_42', 'BUS_52'
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'MAINTENANCE', 'RETIRED'
    qr_code_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
    qr_code_url VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_site_vehicle_reg UNIQUE (site_id, registration_number)
);

-- 3. Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES auth.users(id),
    booking_type VARCHAR(16) NOT NULL,          -- 'PRIVATE', 'SHARED'
    origin_location TEXT NOT NULL,
    destination_location TEXT NOT NULL,
    scheduled_start_time TIMESTAMPTZ NOT NULL,
    scheduled_end_time TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'DISPATCHED', 'COMPLETED', 'CANCELLED'
    allotted_vehicle_id UUID REFERENCES vehicles(id),
    allotted_driver_id UUID,
    passenger_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Trip Participants
CREATE TABLE trip_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(128) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    check_in_status VARCHAR(32) NOT NULL DEFAULT 'AWAITING', -- 'AWAITING', 'BOARDED', 'NO_SHOW'
    check_in_time TIMESTAMPTZ,
    is_unscheduled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Optimization: Compound indexes matching RLS filtering patterns
CREATE INDEX idx_vehicles_site ON vehicles(site_id);
CREATE INDEX idx_bookings_site_status ON bookings(site_id, status);
CREATE INDEX idx_bookings_requester ON bookings(site_id, requester_id);
CREATE INDEX idx_participants_site_booking ON trip_participants(site_id, booking_id);
CREATE INDEX idx_participants_mobile ON trip_participants(site_id, mobile_number);

```

---

## 4. Row-Level Security (RLS) Policy Declarations

### 4.1 Enable RLS on All Tables

By default, enabling RLS denies access to all non-superuser callers unless an explicit policy permits it.

```sql
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_participants ENABLE ROW LEVEL SECURITY;

```

---

### 4.2 Sites Policy (Super Admin vs. Site Users)

* **Super Admin:** Can view, provision, and edit all plant sites.
* **Plant Staff:** Can view only their assigned plant metadata.

```sql
CREATE POLICY "Super admin has full control of sites"
ON sites
FOR ALL
TO authenticated
USING (app.is_super_admin())
WITH CHECK (app.is_super_admin());

CREATE POLICY "Users can view their assigned site details"
ON sites
FOR SELECT
TO authenticated
USING (id = app.current_site_id());

```

---

### 4.3 Vehicle Inventory Policies

* **Plant Admin:** CRUD operations permitted on vehicles belonging to their `site_id`.
* **Employees / Drivers:** Read-only access to active vehicles within their `site_id`.
* **Super Admin:** Global read/write access.

```sql
-- 1. Super Admin Full Access
CREATE POLICY "Super admin full access on vehicles"
ON vehicles
FOR ALL
TO authenticated
USING (app.is_super_admin())
WITH CHECK (app.is_super_admin());

-- 2. Plant Admin Vehicle Management
CREATE POLICY "Plant admin manage site vehicles"
ON vehicles
FOR ALL
TO authenticated
USING (
    site_id = app.current_site_id() 
    AND app.current_role() = 'PLANT_ADMIN'
)
WITH CHECK (
    site_id = app.current_site_id() 
    AND app.current_role() = 'PLANT_ADMIN'
);

-- 3. Requester / Driver Read Access
CREATE POLICY "Staff read site vehicles"
ON vehicles
FOR SELECT
TO authenticated
USING (
    site_id = app.current_site_id() 
    AND status = 'ACTIVE'
);

```

---

### 4.4 Booking Workflow Policies (Granular Role Isolation)

* **Requester:** Can create bookings within their plant, view their own bookings, and cancel them while still in `PENDING` state.
* **Plant Transport Admin:** Can see, approve, reassign, or cancel all bookings within their plant.
* **Driver:** Can see assigned bookings within their plant.

```sql
-- Super Admin Global Override
CREATE POLICY "Super admin full access on bookings"
ON bookings
FOR ALL
TO authenticated
USING (app.is_super_admin())
WITH CHECK (app.is_super_admin());

-- Plant Admin Site Oversight
CREATE POLICY "Plant admin oversee site bookings"
ON bookings
FOR ALL
TO authenticated
USING (
    site_id = app.current_site_id() 
    AND app.current_role() = 'PLANT_ADMIN'
)
WITH CHECK (
    site_id = app.current_site_id() 
    AND app.current_role() = 'PLANT_ADMIN'
);

-- Requester: Select Own Bookings
CREATE POLICY "Requesters view own bookings"
ON bookings
FOR SELECT
TO authenticated
USING (
    site_id = app.current_site_id() 
    AND requester_id = auth.uid()
);

-- Requester: Create Booking (Strict site check)
CREATE POLICY "Requesters create bookings for own site"
ON bookings
FOR INSERT
TO authenticated
WITH CHECK (
    site_id = app.current_site_id() 
    AND requester_id = auth.uid()
);

-- Requester: Modify/Cancel Pending Booking
CREATE POLICY "Requesters cancel pending bookings"
ON bookings
FOR UPDATE
TO authenticated
USING (
    site_id = app.current_site_id() 
    AND requester_id = auth.uid() 
    AND status = 'PENDING'
)
WITH CHECK (
    site_id = app.current_site_id() 
    AND requester_id = auth.uid()
);

```

---

### 4.5 Unauthenticated QR Code Attendance Check-In Policy

Passengers scanning physical QR decals on vehicle dashboards access the web attendance page without signing into an enterprise account. The public endpoint must verify attendance securely without exposing private manifest data.

```sql
-- Public scanning endpoint can verify participant record if vehicle matches
CREATE POLICY "Public QR scan can update participant attendance"
ON trip_participants
FOR UPDATE
TO anon, authenticated
USING (
    -- Match participant to an active trip on the scanned vehicle
    EXISTS (
        SELECT 1 FROM bookings b
        JOIN vehicles v ON v.id = b.allotted_vehicle_id
        WHERE b.id = trip_participants.booking_id
          AND b.status IN ('APPROVED', 'DISPATCHED')
          AND v.qr_code_uuid = (
              nullif(current_setting('app.scanned_qr_uuid', true), '')::uuid
          )
    )
)
WITH CHECK (
    check_in_status IN ('BOARDED')
);

```

---

## 5. Security & Isolation Testing Protocol

Run these verification tests inside Supabase SQL editor to confirm data leak prevention.

```sql
-- Step 1: Simulate Plant Admin from Vadodara (Site 1)
SET LOCAL request.jwt.claims = '{
  "sub": "00000000-0000-0000-0000-000000000001",
  "app_metadata": {
    "site_id": "11111111-1111-1111-1111-111111111111",
    "role": "PLANT_ADMIN"
  }
}';

-- Test 1: Query all vehicles (Must return ONLY Site 1 records)
SELECT id, site_id, registration_number FROM vehicles;

-- Test 2: Malicious insertion into Bharuch (Site 2)
-- Must fail with error: new row violates row-level security policy
INSERT INTO vehicles (site_id, registration_number, model, seat_capacity, category)
VALUES ('22222222-2222-2222-2222-222222222222', 'GJ-16-XX-0001', 'Innova', 6, 'SUV_6');

-- Reset connection session
RESET request.jwt.claims;

```

---

## 6. Audit Trail & Cross-Site Partition Safeguards

1. **Immutable Site Tagging via DB Trigger:** To prevent client tampering or parameter poisoning, an insert trigger automatically forces `NEW.site_id = app.current_site_id()` for non-super admins.
2. **Service Role Key Isolation:** The Supabase `service_role` key bypasses RLS completely. It is restricted to the Cloudflare Worker Queue Consumer (for outbound background messaging) and is **never** bundled or referenced in the frontend or public-facing APIs.
3. **Audit Log Table:** All vehicle reassignments, admin overrides, and cancellations are written to a partitioned `audit_logs` table tagged by `site_id`, `actor_id`, and `ip_address`.