# Supabase Setup - First Story Films

Follow these steps in order.

---

## Step 1: Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Choose organization, name (e.g. `first-story-films`), database password, region
4. Wait until the project status is **Active**

---   

## Step 2: Run the database migrations

> [!WARNING]
> **NEVER** manually apply only `001_initial_schema.sql` to your database. The application depends on all subsequent database migrations (up to the latest database migrations) to enable critical security, RLS, sequence generator, rate-limiting, and accounting features. Always apply the complete ordered migration set.

### Option A: Deploy to Production (Preferred)

Use the Supabase CLI to apply migrations to your linked remote production database:

1. Log in to the Supabase CLI:
   ```bash
   supabase login
   ```
2. Link your local repository to your remote Supabase project:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
3. Push all pending migrations to the remote database:
   ```bash
   supabase db push
   ```

### Option B: Local Development & Validation

To apply migrations locally for testing and development:

1. Ensure Docker is running.
2. Initialize and start the local Supabase container:
   ```bash
   supabase start
   ```
3. Reset your local database to apply all migrations from scratch in order:
   ```bash
   supabase db reset
   ```

### Option C: CI/CD Pipeline Validation

In the GitHub Actions CI pipeline, all migrations are validated automatically on every pull request or push to `main` by starting a local Supabase container:
```yaml
- name: Setup Supabase CLI
  uses: supabase/setup-cli@v1
- name: Start local Supabase to validate migrations
  run: supabase start
```

---

## Step 3: Seed data information

No required seed file is used. Required schema/default data must come from migrations. Local demo data should be inserted manually or via a non-committed local script.

---

## Step 4: Enable email authentication

1. Go to **Authentication** -> **Providers**
2. Open **Email**
3. Enable **Email** provider
4. For local testing you can turn off **Confirm email** (Authentication -> Providers -> Email -> Confirm email off)

---

## Step 5: Create your first admin user

### Option A - Dashboard (recommended)

1. Go to **Authentication** -> **Users** -> **Add user** -> **Create new user**
2. Enter email and password
3. Under **User Metadata**, paste:

```json
{
  "role": "admin",
  "full_name": "Admin User"
}
```

4. Save

The trigger `handle_new_user` automatically creates a row in `profiles` with role `admin`.

### Option B - User already exists without metadata

Run in SQL Editor (replace email):

```sql
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role":"admin","full_name":"Admin User"}'::jsonb
WHERE email = 'you@example.com';

UPDATE public.profiles
SET role = 'admin', full_name = 'Admin User'
WHERE email = 'you@example.com';
```

### Roles

| Role      | Use for                          |
|-----------|----------------------------------|
| `admin`   | Full access + User Management    |
| `manager` | Masters, accounting, customers   |
| `sales`   | Dashboard, leads, quotes, orders |

---

## Step 6: Connect the Next.js app

1. In Supabase: **Project Settings** -> **API**
2. Copy:
   - **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key -> `SUPABASE_SERVICE_ROLE_KEY`
 
3. In `first-story-films`, create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-secret...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> [!IMPORTANT]
> `SUPABASE_SERVICE_ROLE_KEY` is **required** server-side for rate limiting checks, user management, and public lead submissions. It must **never** be exposed in client-side code (never prefix it with `NEXT_PUBLIC_`).

4. Start the app:

```bash
cd first-story-films
npm run dev
```

5. Test:
   - **Localhost:** http://localhost:3000/login or http://127.0.0.1:3000/login  
   - **Local Network:** `http://<YOUR_LOCAL_IP>:3000/login` (e.g., `http://192.168.1.100:3000`)
     - Find your IP: Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux), use the IPv4 address  
   - Public form: http://localhost:3000/inquiry  

---

## Step 7: Verify setup

Run in SQL Editor:

```sql
SELECT * FROM settings;
SELECT * FROM profiles;
SELECT * FROM services;
```

You should see default settings keys and your admin profile.

---

---

## Production Auth Configuration & Hardening

For production deployments, the Supabase authentication settings must be locked down to prevent unauthorized signups and enforce strong password policies. Configure these in the Supabase Dashboard under **Authentication** -> **Providers** and **Authentication** -> **Policies**:

1. **Disable Public Signups**:
   - Under **Providers** -> **Email**, toggle **Allow new user signups via email** to **OFF** (or set `enable_signup = false` in `supabase/config.toml`). This ensures all accounts must be admin-created or invite-only.
2. **Require Email Confirmation**:
   - Under **Providers** -> **Email**, toggle **Confirm email** to **ON** (or set `enable_confirmations = true` in `supabase/config.toml`).
3. **Enforce Password Complexity**:
   - Set the minimum password length to **8** characters (or higher) and enable complexity requirements requiring lowercase, uppercase, digits, and symbols (`lower_upper_letters_digits_symbols`).
4. **Restrict Redirect URLs**:
   - Restrict **Site URL** and **Additional Redirect URLs** to production domains (e.g. `https://firststoryfilms.com`) rather than localhost, to avoid open redirect vulnerabilities.
5. **MFA Expectations**:
   - Multi-Factor Authentication (MFA) is strongly recommended for administrative accounts. Enable TOTP under **Authentication** -> **MFA** and guide administrators to enroll via their profile page.
6. **Service-Role Key Handling**:
   - The `SUPABASE_SERVICE_ROLE_KEY` has full administrative database privileges. Ensure it is stored securely in environment variables (Vercel settings) and NEVER prefixed with `NEXT_PUBLIC_` or referenceable in client-side code.

---

## Production Verification & Pre-Launch Checklist

Before launching or updating the application in production, complete the following validation pass:

### 1. Migration Verification
- [ ] **Migrations Folder Check**: Verify that all migration files (from `001` through the latest) are present under the `supabase/migrations/` folder.
- [ ] **Clean Migration Validation**: Verify that `supabase db reset` succeeds without errors on a clean local instance before applying to production.
- [ ] **CLI Status Check**: Run `supabase migration list` to verify that all migration versions show `Applied` status on the production database.
- [ ] **Db Schema Verification**: Run the verification queries under "Step 8: Database Object Verification Queries" to ensure all views, functions, sequences, and tables exist.

### 2. Auth Verification
- [ ] **Signups Blocked Check**: Attempt to sign up via Supabase Client (if exposed) or direct POST request to `/auth/v1/signup`. The request MUST fail.
- [ ] **Email Confirmation Enforcement Check**: Attempt to create a user and log in immediately without confirmation. Authentication should be blocked until confirmed.
- [ ] **Complexity Check**: Attempt to set a simple password (e.g. `123456`) and verify the password policy blocks it.
- [ ] **Redirect URL Restricting Check**: Verify that redirection only forwards to approved domains (Site URL or listed redirect patterns).

### 3. Webhook & Operational Alerting Verification
- [ ] **Alert Webhook URL**: Confirm `OPERATIONAL_ALERT_WEBHOOK_URL` is set in production.
- [ ] **Durable Alert Sink**: Confirm `OPERATIONAL_ALERT_DURABLE_SINK=supabase` is set in production so alert-worthy events are stored in `operational_events` before webhook delivery.
- [ ] **Webhooks Functional Check**: Simulate a warning event or trace log in staging/pre-production and check that the destination Slack/Discord channel receives the sanitized JSON payload.
- [ ] **Non-Blocking Telemetry**: Verify that non-critical logging calls (e.g. `pdf_render_succeeded`) are not awaited, avoiding request latency.
- [ ] **Sanitization Check**: Review log outputs to guarantee that credentials, passwords, and PII are redacted.

### 4. PDF Rendering Verification
- [ ] **Sandbox Policy Compliance**: Verify `PDF_CHROMIUM_NO_SANDBOX` and `PDF_CHROMIUM_NO_SANDBOX_PRODUCTION_ACK` settings match the hosting container environment capabilities.
- [ ] **Shared PDF Cache**: For horizontally scaled production, set `PDF_CACHE_BACKEND=supabase-storage` and confirm the private `pdf-cache` storage bucket exists.
- [ ] **Distributed Render Lock**: For horizontally scaled production, set `PDF_RENDER_LOCK_MODE=database` and confirm `try_acquire_pdf_render_slot` / `release_pdf_render_slot` exist after migrations.
- [ ] **PDF Endpoints Check**: Run E2E tests or query `/api/quotations/[id]/pdf` and `/api/orders/[id]/pdf` using valid credentials. Verify response status is `200` and `Content-Type` is `application/pdf`.

### 5. Role Reconciliation Verification
- [ ] **Split-Brain Detection Check**: Verify that the database RPC function `reconcile_user_roles()` runs and returns `0` (or greater if repairs were made).
- [ ] **UI Repair Check**: Navigate to the User Management admin page and ensure the repair button (blue circular arrow) executes the `repairUserRole` server action without throwing exceptions.

---

## Step 8: Database Object Verification Queries

Open the **SQL Editor** in the Supabase Dashboard, create a **New query**, and execute the following checks to verify the integrity of the deployed database:

### 1. Verify Profiles Table and RLS
Check if the `profiles` table is present and has Row Level Security (RLS) enabled:
```sql
-- Check if table exists and returns columns
SELECT id, email, role, full_name FROM public.profiles LIMIT 1;

-- Check if RLS is enabled on public.profiles
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE oid = 'public.profiles'::regclass;
-- Expected relrowsecurity = true
```

### 2. Verify check_rate_limit RPC Function
Check if the distributed token-bucket rate limiter RPC function exists:
```sql
SELECT has_function_privilege('public.check_rate_limit(text, numeric, numeric, numeric)', 'execute');
-- Expected result: true
```

### 3. Verify Payment RPC Functions
Check if the secure transaction-safe payment mutation functions exist:
```sql
SELECT 
  has_function_privilege('public.add_order_payment(uuid, numeric, date, text, uuid)', 'execute') AS add_ok,
  has_function_privilege('public.update_order_payment(uuid, numeric, date, text, uuid)', 'execute') AS update_ok,
  has_function_privilege('public.delete_order_payment(uuid, uuid)', 'execute') AS delete_ok;
-- Expected result: true, true, true
```

### 4. Verify Sequence Generators
Check if receipt and invoice sequence generation functions exist:
```sql
SELECT 
  has_function_privilege('public.next_receipt_number(date)', 'execute') AS receipt_seq_ok,
  has_function_privilege('public.next_invoice_number(date, text)', 'execute') AS invoice_seq_ok;
-- Expected result: true, true
```

### 5. Verify Accounting Balance View
Check if the optimized database view for account balances exists:
```sql
-- Verify view exists and can be queried
SELECT id, name, current_balance, entry_count 
FROM public.accounting_accounts_with_balances 
LIMIT 1;
```

### 6. Verify Row Level Security on Sensitive Tables
Check if RLS is enabled on all tables handling sensitive or system state data:
```sql
SELECT 
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('rate_limits', 'accounting_entries', 'payments', 'invoice_number_sequences', 'receipt_number_sequences');
-- Expected result: rls_enabled must be true for all listed tables
```

---

## PDF Rendering Infrastructure Guide

The PDF rendering module is designed to perform safely and reliably under moderate loads using local process boundaries.

### 1. Bounded In-Memory Cache
- **Implementation**: The PDF cache in [pdf-cache.ts](../src/lib/pdf-cache.ts) stores pre-compiled PDF buffers in memory, using the document ID and its `updated_at` timestamp as a composite cache key.
- **Cache TTL**: Defaults to `900` seconds (15 minutes), configurable via `PDF_CACHE_TTL_SECONDS` env variable.
- **Cache Max Entries**: Defaults to `20` entries, configurable via `PDF_CACHE_MAX_ENTRIES` env variable.
- **Cache Max Bytes**: Defaults to `25` MB (26,214,400 bytes), configurable via `PDF_CACHE_MAX_BYTES` env variable.
- **Eviction Policy**: Active expired check is performed on every get and set operation. When the cache exceeds either the maximum entries or maximum bytes limits, the oldest entries (based on FIFO insertion order via Map key iterator) are evicted automatically until the cache fits within the configured limits.
- **No Rate Limit Cost**: Requests that trigger cache hits do not evaluate route-level rendering rate limits. They bypass the Puppeteer step entirely and return immediately.

### 2. Concurrency Controls
- **Implementation**: The browser launcher in [pdf-puppeteer.ts](../src/lib/pdf-puppeteer.ts) uses a semaphore pattern to restrict concurrent rendering operations.
- **Limits**: Maximum of `2` concurrent browser rendering jobs are allowed at any time, configurable via `PDF_MAX_CONCURRENT_RENDERS` env variable. Additional requests wait in a FIFO queue. If a request waits longer than `30` seconds (configurable via `PDF_RENDER_TIMEOUT_MS`), it aborts with a 503 Service Unavailable error to prevent thread starvation.
- **Finally Block Safety**: Active rendering counters are guaranteed to release via try-finally execution blocks.

### 3. Process-Local Limitations
- **Per-Process Cache**: The cache is stored in the application's local process memory. Replicas or serverless function instances do not share cache entries.
- **Per-Process Concurrency**: Concurrency queueing is local to the instance. Under high scaling, concurrent requests across multiple instances can still place load on the database and trigger multiple browser spin-ups.
- **Durable Lifespan**: Cache is completely lost on process restart or serverless container cold-starts.

### 4. Future Roadmap (Stateless Horizontal Scaling)
To scale the PDF engine to support high concurrency:
- **Persistent Object Store**: Cache generated PDF binaries in a shared object storage bucket (e.g. Supabase Storage, AWS S3, or Cloudflare R2) instead of local memory. Store the document's `updated_at` column as a cache key in the storage metadata to validate freshness.
- **Distributed Cache Store**: Replace the in-memory Map with a shared Redis or Memcached store for high-performance retrieval across all instances.
- **Distributed Worker Queue**: Spin off the PDF rendering to a dedicated background worker pool (e.g. BullMQ, Inngest, or Celery) using Redis or Postgres as a queue back-end, allowing workers to run asynchronously.
- **External PDF Renderer**: Outsource browser execution to an external headless browser rendering pool (e.g. Browserless.io) or dedicated PDF renderers to offload heavy Chromium CPU usage from the main web servers.

---

## Operational Alerting & Telemetry Configuration

The application implements a synchronous, fail-safe logging transport that captures system-critical events and dispatches alerts to external telemetry sinks.

### 1. Alerting Webhook Configuration
Configure the following environment variables in your production environment (e.g., Vercel):
- `OPERATIONAL_ALERT_WEBHOOK_URL`: The destination URL (e.g., Slack or Discord webhook) for alerting payloads. If unset, alerting is disabled.
- `OPERATIONAL_ALERT_MIN_SEVERITY`: Minimum severity level to alert on (options: `info`, `warn`, `error`. Default: `error`).
- `OPERATIONAL_ALERT_MAX_ATTEMPTS`: Pinned maximum retry attempts for webhook delivery (default: `3`).
- `OPERATIONAL_ALERT_INITIAL_DELAY_MS`: Delay before the first webhook retry (default: `200`ms, uses exponential backoff: 200ms -> 400ms).

### 2. Critical Alerts Documented
The logger issues webhook payloads for critical security and operational events:
- **`split_brain_alert`**: Severity: `error`, triggered when a user's role metadata in Supabase Auth differs from the authoritative database record in `public.profiles`.
- **`role_change_failed`**: Severity: `error`, triggered when an administrative role update is initiated but database synchronization fails.
- **`security_policy_violation`**: Severity: `warn`, triggered when an unauthorized user attempts to perform restricted operations or execute admin-only server actions.
- **`pdf_chromium_no_sandbox_blocked`**: Severity: `warn` / `error`, triggered when Chromium launches without a sandbox in production without explicit configuration acknowledgement.

### 3. Webhook Retry Behavior
- Webhook alerts are dispatched asynchronously but awaited for critical events (`severity: "error"` or `alert: true`) to ensure delivery before serverless container suspension.
- If a delivery attempt fails due to a network interruption or target service timeout, the logger retries up to `OPERATIONAL_ALERT_MAX_ATTEMPTS` times using exponential backoff.
- If all attempts are exhausted, the failure is swallowed with console warnings to prevent blocking application flows or crashing active user sessions.

---

## User / Role Split-Brain Reconciliation Runbook

Because Supabase Auth metadata and profiles are separate data stores, role mismatches (split-brain state) can occur if a database transaction fails after an auth update succeeds.

### 1. Expected Operator Response
When a `split_brain_alert` or `role_change_failed` is received:
1. Identify the affected User ID (`userId`) and the attempted target role (`role`) from the webhook JSON payload.
2. Formulate a mismatch investigation (see below) to verify if the mismatch was caused by transient database network failures or a manual, unauthorized modification in the Supabase Auth system.
3. Initiate role reconciliation via the UI or the database RPC helper.

### 2. Mismatch Investigation Process
1. Query the user's current database role:
   ```sql
   SELECT role, email FROM public.profiles WHERE id = 'user-uuid';
   ```
2. Query the user's auth metadata role:
   ```sql
   SELECT raw_app_meta_data->>'role' AS auth_role, email 
   FROM auth.users 
   WHERE id = 'user-uuid';
   ```
3. Check application logs around the time of the alert to determine if a database timeout occurred.
4. If the database role is correct but the auth metadata is out of sync, execute a repair.

### 3. Repair Workflows
- **Option A: Admin UI Repair (Targeted)**
  1. Log in to the application as an `admin`.
  2. Navigate to the **User Management** page (`/users`).
  3. Locate the row corresponding to the affected user.
  4. Click the blue **Repair** button (indicated by a circular reset/reload icon `RotateCcw`). This invokes the type-safe `repairUserRole` Server Action, restoring the auth metadata value to match the database role.
- **Option B: Postgres RPC Repair (Bulk)**
  1. Open the SQL Editor in the Supabase Dashboard.
  2. Run the `reconcile_user_roles` RPC function as the `service_role`:
     ```sql
     -- Automatically reconciles auth.users raw_app_meta_data for all mismatched users
     -- Returns the count of repaired rows
     SELECT public.reconcile_user_roles();
     ```
- **Option C: SQL Manual Repair (Single User)**
  1. Run the following update command in the SQL Editor:
     ```sql
     UPDATE auth.users
     SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"sales"') -- Replace "sales" with target role
     WHERE id = 'user-uuid';
     ```

### 4. Operational Emergency Procedures

#### Split-Brain Response
- If a user's role is out of sync and causing login issues or incorrect access control:
  1. Temporarily revoke access by locking their account if needed.
  2. Perform the **Admin UI Repair** or **Postgres RPC Repair**.
  3. Instruct the user to log out and log in again to refresh their JWT claims.

#### Failed Reconciliation Response
- If `reconcile_user_roles()` or `repairUserRole` fails to reconcile:
  1. Inspect the profiles table for database lock issues or constraints:
     ```sql
     SELECT * FROM pg_stat_activity WHERE query LIKE '%profiles%';
     ```
  2. Verify that the user ID exists in both `auth.users` and `public.profiles`. If the profile is missing entirely, check the trigger logs and manually create the profile row before running repair.

#### Webhook Failure Response
- If `OPERATIONAL_ALERT_WEBHOOK_URL` is unreachable and alerts are not being received:
  1. Check Vercel logs for webhook dispatch warning messages (`Telemetry alert attempt X failed`).
  2. Verify webhook URL endpoint validity and network egress routing permissions.
  3. As a backup, query the `profiles` and `auth.users` tables daily to detect any discrepancies:
     ```sql
     SELECT p.id, p.email, p.role AS db_role, u.raw_app_meta_data->>'role' AS auth_role
     FROM public.profiles p
     JOIN auth.users u ON u.id = p.id
     WHERE u.raw_app_meta_data->>'role' IS DISTINCT FROM p.role::text;
     ```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **Database error creating new user** | Ensure all database migrations were successfully applied (up to the latest number). The `handle_new_user` trigger is created by the migrations. |
| Login works but redirects back to login | Check `.env.local` URL and anon key match the project |
| Public form: **RLS policy for table leads** | Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local` and all migrations are pushed to the database. |
| Public form: “Failed to create lead” | Re-run migration; confirm RLS policies exist on `leads` |
| Public form: empty Events/Services | Add rows in Masters (under Settings/Masters) after logging in |
| Logged in as admin but shows **sales** | Run `fix_admin_role.sql` (replace email). Metadata must be lowercase `"admin"`. Sign out and sign in again. |
| User has wrong menu / access | Set `role` in user metadata and update `profiles.role` |
| `role` cast error on signup | Metadata must be exactly `"admin"`, `"manager"`, or `"sales"` (lowercase) |

---

## Rate Limit Maintenance & Fallback Cleanup

The rate limiter cleans up old tokens using a scheduled `pg_cron` job in Supabase. If `pg_cron` is not configured or unavailable on the remote project, rate limits can grow.

### Fallback Manual Cleanup
Run the following query in the Supabase SQL editor daily or configure an external HTTP scheduler to execute:
```sql
DELETE FROM public.rate_limits 
WHERE last_refilled_at < now() - INTERVAL '24 hours';
```

---

## Web Accessibility (WCAG 2.2 AA) Verification Plan

To verify visual and interactive accessibility of first-story-films, perform the following validation pass:

1. **Keyboard Navigation**:
   - Ensure all interactive controls (buttons, inputs, select dropdowns) can receive focus using `Tab` and `Shift+Tab`.
   - Verify that focused elements have a clear visual focus outline.
   - Confirm forms can be submitted using the `Enter` key.
2. **Screen Readers**:
   - Verify all form elements have explicit, descriptive labels.
   - Verify all action-only icon buttons (e.g. edit/delete icon buttons) have an `aria-label` or `tooltip` describing their action.
3. **Color Contrast**:
   - Text elements must meet a minimum contrast ratio of 4.5:1 against their backgrounds (3:1 for large text).
