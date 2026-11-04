```
plant-vehicle-booking/
├── .github/
│   ├── workflows/
│   │   ├── deploy-pages.yml               # CI/CD: Builds and deploys frontend to Cloudflare Pages
│   │   ├── deploy-workers.yml             # CI/CD: Deploys API & Queue Consumer workers via Wrangler
│   │   └── supabase-test.yml              # CI/CD: Automated migration and RLS policy validation
│   └── CODEOWNERS
├── .vscode/                               # Optimized for vscode.dev & GitHub Codespaces
│   ├── extensions.json                    # Recommended extensions (Tailwind, ESLint, Prettier, Prisma/SQL)
│   ├── launch.json                        # Wrangler & Next.js local debug configs
│   └── settings.json                      # Formatter, schema mappings, and workspace rules
│
├── apps/
│   ├── web/                               # Cloudflare Pages (Frontend Web App & PWA)
│   │   ├── public/
│   │   │   ├── icons/                     # PWA manifest icons & branding
│   │   │   ├── sound/                     # QR scan confirmation audio feedback
│   │   │   └── manifest.json              # PWA web manifest
│   │   ├── src/
│   │   │   ├── app/                       # Next.js App Router (Static Export: output: 'export')
│   │   │   │   ├── (auth)/                # Employee & Admin login, password reset
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── admin/             # Transport Admin: fleet inventory, proxy booking, reports
│   │   │   │   │   ├── super-admin/       # Site provisioning, gateway credentials, global toggles
│   │   │   │   │   ├── driver/            # Live manifests, manual attendance overrides
│   │   │   │   │   └── requester/         # New booking, capacity selector, 1-click re-book, history
│   │   │   │   ├── attend/                # Zero-login QR landing route: /attend?v=[vehicle_id]
│   │   │   │   ├── feedback/              # Post-trip 1-to-5 star rating link
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── components/                # Modular UI components
│   │   │   │   ├── attendance/            # QR scanner, manual check-in dialog, occupancy meter
│   │   │   │   ├── booking/               # Passenger adder, vehicle picker, date-time selector
│   │   │   │   ├── common/                # Buttons, modals, tables, badges, status indicators
│   │   │   │   └── reports/               # Utilization charts, export buttons (.xlsx, .pdf)
│   │   │   ├── hooks/                     # Custom React hooks (useAuth, useTenant, useRealtimeTrip)
│   │   │   ├── lib/                       # Supabase client (read-only/RLS queries) & client utilities
│   │   │   └── styles/                    # Tailwind CSS globals
│   │   ├── capacitor.config.ts            # Capacitor native packaging configuration
│   │   ├── next.config.mjs                # Configured for static HTML export
│   │   ├── package.json
│   │   └── tailwind.config.ts
│   │
│   └── mobile/                            # Capacitor wrapper outputs (Android & iOS)
│       ├── android/                       # Native Android Studio project (Gradle, AndroidManifest)
│       ├── ios/                           # Native Xcode project (Podfile, Info.plist)
│       └── package.json                   # Mobile build scripts (cap sync, cap open)
│
├── workers/                               # Cloudflare Workers (Edge Backend Services)
│   ├── api/                               # Core REST API (Wrangler Project)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── attendance.ts          # Validates QR HMAC, checks trip window, records attendance
│   │   │   │   ├── bookings.ts            # Booking CRUD, fast re-book, status mutations
│   │   │   │   ├── dispatch.ts            # Auto-allotment engine, manual reassignment, approval
│   │   │   │   ├── fleet.ts               # Vehicle & driver CRUD, QR token regeneration
│   │   │   │   ├── reports.ts             # Aggregation endpoints for daily/monthly utilization
│   │   │   │   └── super-admin.ts         # Plant site provisioning, gateway secrets management
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts                # JWT verification & RBAC role guards
│   │   │   │   ├── firewall-guard.ts      # Rate limiting & origin verification
│   │   │   │   └── tenant.ts              # Resolves and injects `site_id` into query contexts
│   │   │   ├── services/
│   │   │   │   ├── allotment.ts           # Best-fit vehicle selection algorithm
│   │   │   │   ├── qr-generator.ts        # Cryptographic HMAC signing and SVG/PDF QR decal generation
│   │   │   │   └── supabase.ts            # Server-side Supabase client using Service Role Key
│   │   │   ├── index.ts                   # Router entrypoint
│   │   │   └── types.ts
│   │   ├── tsconfig.json
│   │   └── wrangler.toml                  # Cloudflare Worker bindings (Vars, Secrets, Queues Producer)
│   │
│   └── queue-consumer/                    # Cloudflare Queue Background Worker (Firewall-Bypass Egress)
│       ├── src/
│       │   ├── gateways/
│       │   │   ├── email.ts               # SMTP / Resend transactional client
│       │   │   ├── sms.ts                 # DLT HTTP API client (India SMS gateway integration)
│       │   │   └── whatsapp.ts            # WhatsApp Business Cloud API (Meta Graph API)
│       │   ├── handlers/
│       │   │   ├── onBookingApproved.ts   # Sends confirmation + driver/vehicle details
│       │   │   ├── onDriverDispatched.ts  # Sends passenger manifest & route endpoints to driver
│       │   │   ├── onTripCancelled.ts     # Instant cancellation broadcast
│       │   │   └── onTripCompleted.ts     # Sends trip closure alert + feedback URL
│       │   ├── index.ts                   # Queue listener (`queue(batch, env)`)
│       │   └── templates/                 # WhatsApp & SMS pre-approved template definitions
│       ├── tsconfig.json
│       └── wrangler.toml                  # Queue consumer worker binding
│
├── packages/                              # Shared Internal Libraries (Monorepo Workspace)
│   ├── config/                            # Shared ESLint, Prettier, and TypeScript base configs
│   │   ├── eslint-preset.js
│   │   └── tsconfig.base.json
│   │
│   ├── database/                          # Supabase Database Migrations & Definitions
│   │   ├── migrations/
│   │   │   ├── 20261101000001_sites_and_tenancy.sql
│   │   │   ├── 20261101000002_vehicles_and_drivers.sql
│   │   │   ├── 20261101000003_bookings_and_participants.sql
│   │   │   ├── 20261101000004_qr_manifest_and_attendance.sql
│   │   │   └── 20261101000005_rls_security_policies.sql
│   │   ├── seed/
│   │   │   ├── seed-sites.sql             # Demo manufacturing plants (e.g., Vadodara, Bharuch)
│   │   │   └── seed-vehicles.sql          # Test inventory (Cars, 4/6 seaters, 42/52-seater buses)
│   │   ├── config.toml                    # Supabase CLI local dev config
│   │   └── types.ts                       # Auto-generated Supabase database types
│   │
│   └── shared-types/                      # Shared TypeScript Interfaces & DTOs
│       ├── src/
│       │   ├── attendance.ts              # Scan payload, boarding status enums
│       │   ├── booking.ts                 # Booking status, vehicle category, passenger interfaces
│       │   ├── fleet.ts                   # Vehicle specs, maintenance flags, driver profiles
│       │   ├── notifications.ts           # Queue message payloads & event schemas
│       │   └── tenancy.ts                 # Site metadata & permission models
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                                  # Project Documentation
│   ├── architecture/
│   │   ├── firewall-bypass-strategy.md    # Plant LAN isolation & Cloudflare Queues blueprint
│   │   ├── multi-tenant-rls.md            # Supabase Row-Level Security rules and tests
│   │   └── qr-attendance-flow.md          # Cryptographic decal verification spec
│   ├── brd/                               # Formal Business Requirements Documents
│   └── sop/                               # SOPs for Plant Transport Admins and Drivers
│
├── .gitignore
├── .npmrc
├── package.json                           # Root monorepo workspace configuration (pnpm / npm workspaces)
├── pnpm-workspace.yaml                    # Workspace definitions (apps/*, workers/*, packages/*)
├── README.md                              # Onboarding and deployment instructions
└── turbo.json                             # Turborepo pipeline cache configuration

```

---

### Key Structural Highlights

* **Firewall Separation:** `workers/queue-consumer` is strictly isolated from `apps/web`. The frontend never imports external messaging SDKs or hits external domains, ensuring strict plant perimeter firewall compliance.
* **Shared Types (`packages/shared-types`):** Booking models, QR payload definitions, and Supabase generated types are maintained in one shared package consumed by both frontend React views and edge Worker endpoints.
* **Zero-Login QR Path (`apps/web/src/app/attend`):** Kept as a lightweight static route that submits directly to `workers/api/routes/attendance.ts`, enabling sub-100ms employee attendance verification even on low-bandwidth factory cellular links.
* **Cloudflare Pages Static Export (`apps/web`):** Next.js is configured for static export (`output: 'export'`), producing static HTML/JS/CSS that seamlessly syncs with Capacitor (`apps/mobile`) to generate the Android `.apk` without code duplication.