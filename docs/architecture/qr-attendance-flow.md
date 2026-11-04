# Technical Specification: QR-Based Cabin Attendance & Live Occupancy Sync

**Target Module:** `apps/web/src/app/attend` & `workers/api/src/routes/attendance.ts`

**Physical Setup:** Laminated QR decal affixed inside the vehicle cabin (dashboard, back of headrest, or near passenger entry)

**Core Constraint:** Zero mobile app install required; works instantly on native smartphone cameras in low-bandwidth plant environments.

---

## 1. System Interaction Flow

The attendance flow links the physical vehicle to the operational trip manifest via a cryptographically signed static QR code.

```
[ Vehicle Added in Admin Portal ]
               │
               ▼
   [ Generate Signed QR Decal ] ────► Affixed to Cab Dashboard / Entry
                                                   │
                                                   ▼
                                       [ Passenger Scans QR ]
                                                   │
                                                   ▼
                                 [ Lightweight Mobile Web Page ]
                                     (https://transit.plant.com/attend)
                                                   │
                           Submits: Badge ID + Registered Mobile Number
                                                   │
                                                   ▼
                                    [ Cloudflare Worker API ]
                                                   │
                     ┌─────────────────────────────┴─────────────────────────────┐
                     │                                                           │
             (1. Validate Token)                                         (2. Match Trip)
           Verify HMAC Signature                                    Find Active / Dispatched Trip
                     │                                              within ±45-min Departure Window
                     │                                                           │
                     └─────────────────────────────┬─────────────────────────────┘
                                                   │
                                                   ▼
                                     [ Verification Engine ]
                     ┌─────────────────────────────┼─────────────────────────────┐
                     │                             │                             │
              [ Manifest Match ]           [ Unscheduled Scan ]            [ Duplicate Scan ]
             Employee on manifest          Not on manifest; space      Already marked 'BOARDED'
                     │                     available in vehicle?                 │
                     │                             │                             │
                     ▼                             ▼                             ▼
           Mark: 'BOARDED'                Mark: 'UNSCHEDULED'             Return: Cached Boarding
           Increment Occupancy            Increment Occupancy             Timestamp (No State Change)
                     │                             │
                     └─────────────────────────────┴─────────────────────────────┐
                                                                                 │
                                                                                 ▼
                                                                     [ Real-Time Sync Layer ]
                                                                     Supabase Realtime Broadcast
                                                                                 │
                                                   ┌─────────────────────────────┴─────────────────────────────┐
                                                   │                                                           │
                                                   ▼                                                           ▼
                                      [ Driver Manifest UI ]                                      [ Admin Live Fleet ]
                                   Toggle Green: Boarded (3/4)                                 Update Plant Seat Headroom

```

---

## 2. Decal Generation & Cryptographic Signing

Each vehicle is assigned a persistent cryptographic token. To prevent URL tampering, the payload contains the vehicle UUID and an HMAC-SHA256 signature generated using a secret key stored in Cloudflare Worker environment secrets.

### Decal Payload Schema

$$\text{Decal URL} = \text{[https://transit.plant.com/attend?vid](https://transit.plant.com/attend?vid)}=\langle\text{vehicle\_id}\rangle\,\&\,s=\langle\text{signature}\rangle$$

$$\text{signature} = \operatorname{HMAC-SHA256}(\text{vehicle\_id} \parallel \text{site\_id}, \text{QR\_SIGNING\_SECRET})$$

### Worker Signature Generator (`workers/api/src/services/qr-generator.ts`)

```typescript
export async function generateSignedVehicleQrUrl(
  vehicleId: string,
  siteId: string,
  baseUrl: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const data = encoder.encode(`${vehicleId}:${siteId}`);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${baseUrl}/attend?vid=${vehicleId}&s=${signature}`;
}

```

---

## 3. Passenger Verification & State Machine

When a passenger scans the QR code, the mobile browser requests the verification endpoint.

### State Transitions

```
               [ AWAITING_BOARDING ]
                         │
        ┌────────────────┴────────────────┐
        │ Scan QR + Valid Emp/Mobile      │ Driver Manual Check-In
        ▼                                 ▼
   [ BOARDED ] ◄────────────────── [ BOARDED ]
        │
        ├─────────────────────────────────┐
        │ Trip Closure                    │ Route Cancelled
        ▼                                 ▼
  [ COMPLETED ]                     [ CANCELLED ]

```

### Verification Evaluation Rules

```
Step 1: HMAC Validation
  ├─ Valid: Proceed to Step 2
  └─ Invalid / Tampered: Return 401 Unauthorized ("Invalid Vehicle QR")

Step 2: Trip Resolution
  ├─ Locate Booking WHERE allotted_vehicle_id = vid 
  │                  AND status IN ('APPROVED', 'DISPATCHED')
  │                  AND scheduled_start_time BETWEEN (NOW() - 45 min) AND (NOW() + 45 min)
  ├─ Found: Active trip identified
  └─ Not Found: Return 404 ("No active trip dispatched for this vehicle")

Step 3: Manifest Verification
  ├─ Match (emp_id + mobile_number in trip_participants):
  │    ├─ If check_in_status == 'BOARDED': Return 200 ("Already checked in at HH:MM")
  │    └─ If check_in_status == 'AWAITING': 
  │         - UPDATE trip_participants SET check_in_status = 'BOARDED', check_in_time = NOW()
  │         - Return 200 ("Check-in Successful")
  │
  └─ No Match (Unscheduled passenger):
       ├─ If Current_Occupancy < Vehicle_Seat_Capacity AND booking_type == 'SHARED':
       │    - INSERT INTO trip_participants (is_unscheduled = true, check_in_status = 'BOARDED')
       │    - Return 200 ("Unscheduled Boarding Recorded - Seat Allocated")
       └─ Else: Return 403 Forbidden ("Vehicle Full or Private Booking - Boarding Denied")

```

---

## 4. API Specification

### Endpoint: Verify & Record Attendance

`POST /api/attendance/scan`

#### Request Payload

```json
{
  "vehicleId": "8f9c1e40-3b2d-4f1e-9a0d-82d287bb29a4",
  "signature": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "employeeId": "EMP-94821",
  "mobileNumber": "9876543210"
}

```

#### Response (200 OK — Successful Boarding)

```json
{
  "success": true,
  "code": "BOARDING_CONFIRMED",
  "message": "Check-in successful. Welcome aboard!",
  "data": {
    "bookingId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "vehiclePlate": "GJ-06-AZ-1024",
    "driverName": "Ramesh Patel",
    "checkInTime": "2026-11-04T16:15:30.120Z",
    "liveOccupancy": 4,
    "maxCapacity": 6
  }
}

```

#### Response (403 Forbidden — Over-Capacity Rejection)

```json
{
  "success": false,
  "code": "CAPACITY_EXCEEDED",
  "message": "Vehicle is at full capacity (6/6). Boarding not permitted."
}

```

---

## 5. Implementation Code

### Worker Attendance Route Handler (`workers/api/src/routes/attendance.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  QR_SIGNING_SECRET: string;
}

export async function handleAttendanceScan(request: Request, env: Env): Promise<Response> {
  const { vehicleId, signature, employeeId, mobileNumber } = await request.json();

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. Fetch vehicle & site metadata
  const { data: vehicle, error: vError } = await supabase
    .from('vehicles')
    .select('id, site_id, registration_number, seat_capacity')
    .eq('id', vehicleId)
    .single();

  if (vError || !vehicle) {
    return new Response(JSON.stringify({ error: 'Vehicle not found' }), { status: 404 });
  }

  // 2. Verify HMAC Signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.QR_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = new Uint8Array(
    signature.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
  );
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(`${vehicleId}:${vehicle.site_id}`)
  );

  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid or forged QR token' }), { status: 401 });
  }

  // 3. Locate Active Trip Window (±45 minutes)
  const now = new Date();
  const windowStart = new Date(now.getTime() - 45 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 45 * 60 * 1000).toISOString();

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_type, driver:drivers(name)')
    .eq('allotted_vehicle_id', vehicleId)
    .in('status', ['APPROVED', 'DISPATCHED'])
    .gte('scheduled_start_time', windowStart)
    .lte('scheduled_start_time', windowEnd)
    .order('scheduled_start_time', { ascending: true })
    .limit(1)
    .single();

  if (!booking) {
    return new Response(
      JSON.stringify({ error: 'No active dispatched trip assigned to this vehicle currently.' }),
      { status: 404 }
    );
  }

  // 4. Calculate Current Boarded Headcount
  const { count: boardedCount } = await supabase
    .from('trip_participants')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', booking.id)
    .eq('check_in_status', 'BOARDED');

  const currentOccupancy = boardedCount || 0;

  // 5. Check if Passenger is in Manifest
  const { data: participant } = await supabase
    .from('trip_participants')
    .select('id, check_in_status, employee_name')
    .eq('booking_id', booking.id)
    .eq('employee_id', employeeId.trim().toUpperCase())
    .eq('mobile_number', mobileNumber.trim())
    .maybeSingle();

  if (participant) {
    if (participant.check_in_status === 'BOARDED') {
      return new Response(JSON.stringify({
        success: true,
        message: 'Already checked in',
        data: { liveOccupancy: currentOccupancy, maxCapacity: vehicle.seat_capacity }
      }), { status: 200 });
    }

    // Mark Scheduled Participant as Boarded
    await supabase
      .from('trip_participants')
      .update({ check_in_status: 'BOARDED', check_in_time: now.toISOString() })
      .eq('id', participant.id);

  } else {
    // Unscheduled passenger handling
    if (currentOccupancy >= (vehicle.seat_capacity - 1) || booking.booking_type === 'PRIVATE') {
      return new Response(JSON.stringify({
        error: 'Vehicle seat capacity reached or private trip reserved.'
      }), { status: 403 });
    }

    // Insert as Unscheduled Boarder
    await supabase.from('trip_participants').insert({
      site_id: vehicle.site_id,
      booking_id: booking.id,
      employee_id: employeeId.trim().toUpperCase(),
      employee_name: 'Unscheduled Passenger',
      mobile_number: mobileNumber.trim(),
      check_in_status: 'BOARDED',
      check_in_time: now.toISOString(),
      is_unscheduled: true
    });
  }

  const finalOccupancy = currentOccupancy + 1;

  // 6. Broadcast Realtime State to Driver Manifest UI
  await supabase.channel(`trip-${booking.id}`).send({
    type: 'broadcast',
    event: 'PASSENGER_BOARDED',
    payload: {
      employeeId: employeeId.toUpperCase(),
      liveOccupancy: finalOccupancy,
      maxCapacity: vehicle.seat_capacity,
      timestamp: now.toISOString()
    }
  });

  return new Response(JSON.stringify({
    success: true,
    code: 'BOARDING_CONFIRMED',
    data: {
      bookingId: booking.id,
      vehiclePlate: vehicle.registration_number,
      driverName: (booking.driver as any)?.name ?? 'Assigned Driver',
      liveOccupancy: finalOccupancy,
      maxCapacity: vehicle.seat_capacity
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

```

---

## 6. Mobile Web Attendance Landing Page

The page located at `apps/web/src/app/attend/page.tsx` loads directly without requiring user authentication.

```tsx
'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AttendancePage() {
  const searchParams = useSearchParams();
  const vehicleId = searchParams.get('vid');
  const signature = searchParams.get('s');

  const [employeeId, setEmployeeId] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [message, setMessage] = useState('');
  const [occupancy, setOccupancy] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus('IDLE');

    try {
      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, signature, employeeId, mobileNumber })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Verification failed');

      setStatus('SUCCESS');
      setMessage(data.message || 'Boarding Confirmed!');
      setOccupancy(`${data.data.liveOccupancy} / ${data.data.maxCapacity} Seats Occupied`);
    } catch (err: any) {
      setStatus('ERROR');
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md bg-slate-800 rounded-xl p-6 shadow-2xl border border-slate-700">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-emerald-400">Plant Transit Check-In</h1>
          <p className="text-sm text-slate-400">Scan verified. Confirm your details to board.</p>
        </div>

        {status === 'SUCCESS' ? (
          <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-lg p-5 text-center">
            <div className="text-4xl mb-2">✅</div>
            <h2 className="text-lg font-semibold text-emerald-300">{message}</h2>
            {occupancy && <p className="text-sm text-slate-300 mt-2 font-mono">{occupancy}</p>}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {status === 'ERROR' && (
              <div className="bg-rose-950/60 border border-rose-500/50 rounded-md p-3 text-rose-300 text-sm">
                {message}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Employee Badge ID</label>
              <input
                type="text"
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                placeholder="e.g. EMP-1042"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Registered Mobile Number</label>
              <input
                type="tel"
                required
                pattern="[0-9]{10}"
                maxLength={10}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying Seat...' : 'Confirm Boarding'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

```

---

## 7. Real-Time Driver Manifest Sync (Supabase WebSockets)

The driver manifest view connects to a dynamic Supabase Realtime channel. When a passenger checks in via the landing page, the manifest row switches state without requiring a manual page refresh.

```typescript
// Driver Tablet/Mobile Manifest Hook
useEffect(() => {
  const channel = supabase
    .channel(`trip-${tripId}`)
    .on('broadcast', { event: 'PASSENGER_BOARDED' }, ({ payload }) => {
      // 1. Play auditory confirmation click
      audioBoardingChime.play();

      // 2. Update local state
      setParticipants((prev) =>
        prev.map((p) =>
          p.employeeId === payload.employeeId
            ? { ...p, check_in_status: 'BOARDED' }
            : p
        )
      );
      setLiveOccupancy(payload.liveOccupancy);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [tripId]);

```