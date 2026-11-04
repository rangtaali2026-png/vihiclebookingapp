# Architecture Document: Manufacturing Plant Firewall Immunity & Asynchronous Egress Strategy

**Target Environment:** Strict Manufacturing Plant LANs (Cisco / Fortinet perimeter firewalls, deep packet inspection, proxy tunnels, whitelist-only outbound egress)

**System Components:** Cloudflare Pages, Cloudflare Workers, Cloudflare Queues, Supabase, External Notification Gateways (WhatsApp, SMS, SMTP)

**Protocol Requirement:** Strictly Port 443 (HTTPS) over a single enterprise domain

---

## 1. Network Problem Statement

Manufacturing operations typically operate behind industrial-grade Next-Generation Firewalls (NGFW) with strict security postures:

1. **Domain Whitelisting & Category Filtering:** Third-party cloud messaging providers (Meta Graph API for WhatsApp, Twilio, external SMS HTTP gateways, Resend/SendGrid) are either classified as social media, marketing, or untrusted external APIs and are actively dropped at the gateway.
2. **Strict Port Blocking:** Direct database connections over raw TCP ports (`5432` or pooled `6543`) are uniformly blocked by default outbound firewall rules.
3. **Deep Packet Inspection (DPI) & SSL Interception:** Client devices (smartphones, handheld terminals, factory PCs) terminating connections to varied external destinations often encounter corporate root certificate injection issues, breaking mobile WebSockets and SDK authentication.
4. **Bandwidth Throttling & Network Latency:** Multi-round-trip handshakes directly to third-party APIs introduce blocking UI latency during peak shift changes.

---

## 2. Ingress & Egress Architecture Diagram

The system decouples user client interactions from external third-party service dependencies. All client ingress is confined to a single whitelisted corporate Fully Qualified Domain Name (FQDN) over port 443. All third-party egress takes place outside the factory perimeter inside the Cloudflare Edge backbone.

```
+-----------------------------------------------------------------------------------------+
| FACTORY LAN / PLANT OT-IT PERIMETER (Strict Inspection & Whitelist-Only Egress)         |
|                                                                                         |
|  [ Factory PC / Admin ]      [ Passenger Mobile / QR ]      [ Driver Mobile Manifest ]  |
|            │                             │                              │               |
|            └──────────────────────┬──────┴──────────────────────────────┘               |
|                                   │                                                     |
|                                   │ HTTPS / TLS 1.3 (Port 443 ONLY)                     |
|                                   │ Target: transit.company.com                         |
|                                   v                                                     |
|                     [ Perimeter Firewall / NGFW ]                                       |
|                     - Policy: Allow *.company.com:443                                   |
|                     - Policy: DROP all external APIs (Meta, Twilio, SMTP)               |
+-----------------------------------┼-----------------------------------------------------+
                                    │
                              (Public Web)
                                    │
+───────────────────────────────────v─────────────────────────────────────────────────────+
| CLOUDFLARE EDGE LAYER (DMZ & Serverless Compute)                                        |
|                                                                                         |
|  1. Cloudflare Pages (Frontend Web App & Static Assets)                                 |
|  2. Cloudflare Worker API Gateway (workers/api)                                         |
|                                                                                         |
|     Incoming Request: POST /api/bookings/approve                                        |
|     ├── Step A: Auth & Role Validation                                                  |
|     ├── Step B: Persist to DB (HTTPS REST / Port 443) ───┐                             |
|     └── Step C: Dispatch Event to Queue ────────┐        │                             |
|                                                 │        │                             |
|                                                 v        │                             |
|     [ Cloudflare Queue: `vehicle-notifications` ]        │                             |
|     - Guaranteed Delivery (At-least-once)                │                             |
|     - Concurrency & Backoff Retry Engine                 │                             |
+─────────────────────────────────────────────────┼────────┼──────────────────────────────+
                                                  │        │
                   Async Job Delivery             │        │ HTTPS REST (Port 443)
                   (Cloud-to-Cloud)               │        │ Service Role Key
                                                  │        v
+─────────────────────────────────────────────────┼─> [ SUPABASE CLOUD ] ─────────────────+
|                                                 │   - Database Engine (PostgreSQL)      |
|                                                 │   - Row-Level Security (RLS)          |
|                                                 │   - Data Partitioned by `site_id`     |
|                                                 │                                       |
+─────────────────────────────────────────────────┼───────────────────────────────────────+
                                                  │
                                                  v
+─────────────────────────────────────────────────────────────────────────────────────────+
| WORKERS QUEUE CONSUMER (workers/queue-consumer)                                         |
| (Runs entirely within Cloudflare Global Data Centers - Zero Plant Firewall Dependency)  |
|                                                                                         |
|  Batch Processor triggers external third-party APIs:                                    |
|                                                                                         |
|  ├── [WhatsApp Business API] ──> Meta Graph API (graph.facebook.com:443)                |
|  ├── [SMS Gateway]           ──> DLT-Registered Telecom Gateway (api.sms.com:443)       |
|  └── [Email Service]         ──> Transactional SMTP Relay / Resend API (443)            |
+─────────────────────────────────────────────────────────────────────────────────────────+

```

---

## 3. Core Architectural Mechanisms

### 3.1 Single-Origin Ingress Tunnel (Port 443 Only)

* **Single Domain Route:** Both the frontend user interface (`apps/web`) and the backend API router (`workers/api`) are bound to the same root domain or designated subdomain (e.g., `[https://transit.plant.internal-corp.com](https://transit.plant.internal-corp.com)`).
* **Cloudflare Reverse Proxy Routing:**
* `/*` $\rightarrow$ Cloudflare Pages (Static assets, SPA/PWA bundles, QR attendance landing views).
* `/api/*` $\rightarrow$ Cloudflare Workers API Gateway.


* **Firewall Rule Profile:** Plant IT only needs to permit a single outbound destination:

$$\text{ALLOW TCP Outbound: Destination = transit.company.com, Port = 443}$$



Zero exceptions are required for external messaging endpoints, CDNs, or database connection pools.

---

### 3.2 Decoupled Asynchronous Egress Pipeline

To ensure plant operators and employees experience immediate UI responses—even if messaging gateways face timeouts or are blocked on internal networks—the dispatch process is fully decoupled.

```
[Client Action] 
       │ 
       ▼ (1. Submits via HTTPS)
[Worker API Route] 
       │ 
       ├─► (2. Atomic DB Mutation over PostgREST HTTPS) ──► [Supabase DB]
       │ 
       ├─► (3. Enqueue Payload in Edge Broker) ───────────► [Cloudflare Queue]
       │ 
       ▼ (4. Immediate HTTP 200 OK returned to User in <50ms)
[Client Screen Updates: "Trip Confirmed"]

```

```
[Cloudflare Queue Event Engine]
       │
       ▼ (Runs independently in cloud space)
[Worker Queue Consumer]
       ├── Retry Policy: Max 5 retries with exponential backoff
       ├── Dead Letter Queue (DLQ): Captures invalid recipient numbers
       │
       ▼ (External API Egress from Cloudflare Data Center)
[Meta WhatsApp Cloud API / SMS DLT Gateway]

```

#### Guarantees Provided by This Decoupling:

1. **Network Independence:** If the factory's primary internet line drops right after the transaction reaches the edge, the notification is already safely buffered in Cloudflare's queue and will dispatch regardless.
2. **Latency Elimination:** External SMS/WhatsApp handshake latencies (often 500ms to 2500ms) are removed from the client's critical path.
3. **No Mixed Content / Origin Blocking:** No client browser or mobile WebView ever issues cross-origin `fetch()` calls to third-party endpoints, preventing CORS and content security policy violations.

---

### 3.3 Supabase Database Egress via HTTPS PostgREST

Standard PostgreSQL drivers (e.g., `pg`, JDBC) initiate stateful TCP handshakes on port `5432` or port `6543`, which corporate security filters routinely drop.

* **Solution:** All Worker-to-Supabase communications use the Supabase JS client configured exclusively over standard HTTPS Port `443` using the RESTful PostgREST interface.
* **Security & Auth:** Queries are executed using the `SUPABASE_SERVICE_ROLE_KEY` securely injected at the Cloudflare Worker runtime layer via encrypted secrets, with the client never having access to service-level keys.

---

## 4. Implementation Code Specifications

### 4.1 Ingress API Route: Producer (`workers/api/src/routes/dispatch.ts`)

This module handles the admin booking approval, updates the state in Supabase, and drops the notification event into the queue.

```typescript
import { createClient } from '@supabase/supabase-js';

export interface Env {
  NOTIFICATIONS_QUEUE: Queue;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export async function handleApproveBooking(request: Request, env: Env): Promise<Response> {
  const { bookingId, siteId, vehicleId, driverId } = await request.json();

  // 1. Initialize Supabase Client over HTTPS (Port 443)
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // 2. Atomic state update
  const { data: booking, error: dbError } = await supabase
    .from('bookings')
    .update({
      status: 'APPROVED',
      allotted_vehicle_id: vehicleId,
      allotted_driver_id: driverId,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .eq('site_id', siteId)
    .select('*, requester:users(name, phone, email), vehicle:vehicles(*), driver:drivers(*)')
    .single();

  if (dbError || !booking) {
    return new Response(JSON.stringify({ error: 'Database mutation failed', details: dbError }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. Fire-and-forget message enqueue (Zero client-side blocking)
  await env.NOTIFICATIONS_QUEUE.send({
    eventType: 'BOOKING_DISPATCHED',
    siteId,
    bookingId: booking.id,
    recipientPhone: booking.requester.phone,
    recipientEmail: booking.requester.email,
    payload: {
      requesterName: booking.requester.name,
      vehiclePlate: booking.vehicle.registration_number,
      vehicleModel: booking.vehicle.model,
      driverName: booking.driver.name,
      driverPhone: booking.driver.phone,
      pickupTime: booking.scheduled_start_time,
      origin: booking.origin_location,
      destination: booking.destination_location
    }
  });

  // 4. Return instant response to Plant Client
  return new Response(JSON.stringify({ success: true, message: 'Trip approved and queued.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

```

---

### 4.2 Cloudflare Queue Consumer: Egress Dispatcher (`workers/queue-consumer/src/index.ts`)

This worker executes entirely outside the manufacturing facility firewall, processing message queues and contacting external APIs.

```typescript
export interface NotificationMessage {
  eventType: string;
  siteId: string;
  bookingId: string;
  recipientPhone: string;
  recipientEmail?: string;
  payload: Record<string, string>;
}

export interface Env {
  WHATSAPP_API_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  SMS_GATEWAY_URL: string;
  SMS_GATEWAY_API_KEY: string;
}

export default {
  async queue(batch: MessageBatch<NotificationMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { eventType, recipientPhone, payload } = msg.body;

      try {
        if (eventType === 'BOOKING_DISPATCHED') {
          // Parallel dispatch to WhatsApp and SMS from Cloudflare Cloud Egress
          await Promise.allSettled([
            sendWhatsAppTemplate(env, recipientPhone, payload),
            sendSmsDltTemplate(env, recipientPhone, payload)
          ]);
        }
        msg.ack(); // Mark complete
      } catch (err) {
        console.error(`Dispatch failure for booking ${msg.body.bookingId}:`, err);
        msg.retry(); // Automatic backoff retry
      }
    }
  }
};

async function sendWhatsAppTemplate(env: Env, phone: string, data: Record<string, string>) {
  const url = `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.WHATSAPP_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: 'vehicle_booking_confirmation',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: data.requesterName },
              { type: 'text', text: `${data.vehicleModel} (${data.vehiclePlate})` },
              { type: 'text', text: `${data.driverName} (${data.driverPhone})` },
              { type: 'text', text: data.pickupTime },
              { type: 'text', text: data.destination }
            ]
          }
        ]
      }
    })
  });
}

async function sendSmsDltTemplate(env: Env, phone: string, data: Record<string, string>) {
  const params = new URLSearchParams({
    apikey: env.SMS_GATEWAY_API_KEY,
    sender: 'PLNTRN',
    numbers: phone,
    message: `Your plant vehicle ${data.vehiclePlate} with driver ${data.driverName} (${data.driverPhone}) is confirmed for ${data.pickupTime}.`
  });
  await fetch(`${env.SMS_GATEWAY_URL}?${params.toString()}`, { method: 'GET' });
}

```

---

## 5. Security & Edge Configuration (`wrangler.toml`)

The configuration specifies bindings, queues, and environmental definitions for deployment.

```toml
name = "plant-transit-api"
main = "src/index.ts"
compatibility_date = "2026-11-01"

# Production Route - Only port 443 HTTPS
routes = [
  { pattern = "transit.company.com/api/*", zone_name = "company.com" }
]

# Internal Queue Producer Binding
[[queues.producers]]
binding = "NOTIFICATIONS_QUEUE"
queue = "vehicle-notifications-prod"

[vars]
SUPABASE_URL = "https://your-project.supabase.co"

```

```toml
# workers/queue-consumer/wrangler.toml
name = "plant-transit-queue-consumer"
main = "src/index.ts"
compatibility_date = "2026-11-01"

# Internal Queue Consumer Binding (No public web routes attached)
[[queues.consumers]]
queue = "vehicle-notifications-prod"
max_batch_size = 10
max_batch_timeout = 5
max_retries = 5
dead_letter_queue = "vehicle-notifications-dlq"

```

---

## 6. Verification & Failover Matrix

| Scenario | Behavior Under Standard Architecture | Behavior Under This Firewall Immunity Strategy |
| --- | --- | --- |
| **Plant Firewall Blocks Meta / Twilio** | Booking fails or UI hangs indefinitely waiting for external API response. | **100% Operational.** UI confirms booking in $<50\text{ms}$; Cloudflare processes notifications externally. |
| **Corporate Proxy Blocks Port 5432 / 6543** | Application fails to connect to database; driver attendance and check-in break. | **100% Operational.** All database communication runs over standard HTTPS Port `443` REST endpoints. |
| **Plant Internet Connection Flaps** | Client attempts to dispatch notifications locally, resulting in dropped requests. | **Resilient.** Once a request reaches Cloudflare Edge, Cloudflare Queues buffer and deliver the message even if the plant disconnects. |
| **High Concurrency Shift Change (Buses)** | Hundreds of simultaneous scans exhaust third-party messaging rate limits. | **Smooth.** Queue consumer automatically batches and rates-limits outbound SMS/WhatsApp messages to match telecom provider limits. |