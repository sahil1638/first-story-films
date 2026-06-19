# First Story Films

Wedding inquiry and business management system built with **Next.js**, **Supabase**, and **Vercel**.

## Features

- **Authentication** – Email/password, session-based, role-based access (Admin, Manager, Sales)
- **Public lead form** – Multi-step inquiry at `/inquiry` (no login)
- **Leads** – Public form leads, manual admin entry, convert to quotations
- **Quotations** – Create quotations from leads; service person counts, deliverables, and PDF export
- **Orders** – Convert quotations to orders; payments, production jobs, GST/non-GST billing, and agreement PDFs
- **Masters** – Manage Services, Events, Deliverables, Agencies, and Crew
- **Customers** – Auto-created from orders with order history and invoices
- **Accounting** – Income/expense entries, categories, and production expense sync
- **Settings** – Terms, agreement content, WhatsApp templates, and public form slug
- **PDF exports** – Download quotation PDFs, order agreement PDFs, and payment receipt PDFs

## Setup

For the complete, step-by-step setup instructions (including local development and remote production deployment), please refer to the authoritative [supabase/SETUP.md](./supabase/SETUP.md).

### 1. Supabase (CLI Workflow)

The standard and supported path for database migrations is using the Supabase CLI.

1. Create a project at [supabase.com](https://supabase.com) and retrieve your project reference.
2. Link and push migrations via CLI (see [SETUP.md](./supabase/SETUP.md#step-2-run-the-database-migrations) for details):
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. Configure authentication settings and create users as detailed in [SETUP.md](./supabase/SETUP.md).

> [!CAUTION]
> **Emergency Manual Fallback**: If CLI deployment is absolutely blocked, migrations can be manually copied and run in order in the Supabase SQL Editor. However, this is NOT recommended as it bypasses CLI migration history tracking and can easily lead to out-of-order schema errors.

### 2. Environment

Copy `.env.local.example` to `.env.local` and set your Supabase values:

``` 
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
PDF_CACHE_TTL_SECONDS=900
PDF_CACHE_MAX_ENTRIES=20
PDF_CACHE_MAX_BYTES=26214400
PDF_CACHE_BACKEND=memory
PDF_CACHE_BUCKET=pdf-cache
PDF_RENDER_LOCK_MODE=local
PDF_RENDER_LOCK_LEASE_SECONDS=40
PDF_CHROMIUM_NO_SANDBOX=false
PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK=false
OPERATIONAL_ALERT_DURABLE_SINK=none
OPERATIONAL_ALERT_WEBHOOK_URL=
```

PDF caching defaults to in-memory for local development. For horizontally scaled production, set `PDF_CACHE_BACKEND=supabase-storage` and keep `PDF_CACHE_BUCKET=pdf-cache`; migration `052` creates the private bucket used by the service-role cache writer.

PDF render concurrency defaults to local process limits. For multi-instance production, set `PDF_RENDER_LOCK_MODE=database` so migration `052` coordinates Chromium render leases across app instances.

Chromium sandboxing is enabled by default. Only set `PDF_CHROMIUM_NO_SANDBOX=true` when the PDF renderer runs in a hardened isolated worker or container. In production, `PDF_CHROMIUM_NO_SANDBOX` is rejected unless `PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK=true` is also set.

Operational alerting writes to console by default. For production, set `OPERATIONAL_ALERT_DURABLE_SINK=supabase` so alert-worthy events are persisted to `operational_events` before webhook delivery. Optionally set `OPERATIONAL_ALERT_WEBHOOK_URL` for Slack/Discord/incident-channel delivery.

When sandboxing is disabled, the renderer should run with the following runtime controls where applicable:

- Non-root user
- Container or worker isolation dedicated to PDF rendering
- seccomp, AppArmor, or user namespace sandboxing
- Strict resource limits and network egress controls

### 3. Run locally

```bash
cd first-story-films
npm install
npm run dev
```

**Access the app:**
- Localhost: http://localhost:3000/login or http://127.0.0.1:3000/login
- Public form: http://localhost:3000/inquiry

### 4. Deploy (Vercel)

1. Push to GitHub and import in Vercel
2. Set the same environment variables
3. Set `NEXT_PUBLIC_APP_URL` to your production URL
4. Set `OPERATIONAL_ALERT_DURABLE_SINK=supabase`
5. Set `PDF_CACHE_BACKEND=supabase-storage` and `PDF_RENDER_LOCK_MODE=database` for horizontally scaled deployments
6. Keep Chromium sandboxing enabled unless the PDF runtime is isolated and you have explicitly acknowledged the production override

## Documentation

- [Route Inventory](./docs/ROUTES.md) - Complete inventory of UI, API, authentication, and PDF routes including parameters, roles, and rate limits.
- [API Reference](./docs/API.md) - Route Handler reference with payloads, auth requirements, rate limits, and response conventions.
- [Security Matrix](./docs/SECURITY_MATRIX.md) - Final application role, RLS, and RPC permission matrix.
- [Incident Response Runbook](./docs/INCIDENT_RESPONSE.md) - Production triage, containment, recovery, and post-incident checklist.
- [Backup And Restore Procedure](./docs/BACKUP_RESTORE.md) - Backup verification, restore steps, and post-restore validation.
- [Accessibility Checklist](./docs/ACCESSIBILITY_CHECKLIST.md) - WCAG-oriented release checklist for public and dashboard workflows.
- [Documentation Review Closure](./docs/DOCUMENTATION_REVIEW.md) - Maps the documentation review gaps to the completed docs.

## Role access

| Module        | Admin | Manager | Sales |
|---------------|-------|---------|-------|
| Dashboard     | ✓     | ✓       | ✓     |
| Masters       | ✓     | ✓       | —     |
| Leads         | ✓     | ✓       | ✓     |
| Quotations    | ✓     | ✓       | ✓     |
| Orders        | ✓     | ✓       | ✓     |
| Accounting    | ✓     | ✓       | —     |
| Customers     | ✓     | ✓       | —     |
| Settings      | ✓     | ✓       | —     |
| User Mgmt     | ✓     | —       | —     |

## Current status

- Core lead → quotation → order workflow is implemented
- GST/non-GST invoice support is available for orders
- PDF generation is available for quotations, order agreements, and payment receipts
- Accounting supports income/expense tracking and production expense sync
- Settings include agreement content

## PDF rendering security

- Default Chromium launch args do not disable the sandbox
- `PDF_CHROMIUM_NO_SANDBOX=true` is opt-in only
- Production deployments must set `PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK=true` before sandbox bypass is allowed
- The PDF renderer still keeps size limits, timeouts, request interception, and concurrency control in place

## Load testing baseline

Run a lightweight HTTP baseline against a running local, staging, or production-safe target:

```bash
npm run test:load -- --url=http://127.0.0.1:3000 --duration=30 --concurrency=4 --paths=/login,/inquiry
```

Use staging data and authenticated/API-specific tooling before load testing protected PDF or accounting export endpoints.

## Future work

- WhatsApp automation for lead notifications and invoice delivery
- Expanded production scheduling and assignment workflows

## Workflow

```
Public Form / Admin → Lead → Quotation → Order → Production → Complete
```
