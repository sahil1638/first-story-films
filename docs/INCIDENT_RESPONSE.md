# Incident Response Runbook

Use this runbook for production security, data integrity, PDF rendering, authentication, and availability incidents.

## Severity Levels

| Severity | Examples | Response Target |
|----------|----------|-----------------|
| SEV-1 | Data breach, service-role key exposure, destructive data loss, app unavailable | Immediate |
| SEV-2 | Role mismatch, PDF generation outage, failed payments/accounting mutation, repeated 500s | Same business day |
| SEV-3 | Isolated user issue, non-critical export failure, degraded performance | Next business day |

## First 15 Minutes

1. Assign an incident owner.
2. Record start time, affected environment, impacted users, and observed symptoms.
3. Stop risky changes: pause deploys, migrations, and manual SQL unless they are part of containment.
4. Preserve evidence: Vercel logs, Supabase logs, request IDs, webhook payloads, and screenshots.
5. Decide whether to disable affected features temporarily.

## Contacts And Systems

| System | Where To Check |
|--------|----------------|
| App runtime | Vercel deployment logs and function logs |
| Database | Supabase dashboard, SQL Editor, database logs |
| Auth | Supabase Auth users, providers, redirect URL settings |
| Alerts | `operational_events`, webhook destination, app console logs |
| CI | GitHub Actions |
| Local validation | `npm run test:ci`, `npm run test:e2e`, `npm run build` |

## Common Incidents

### Service-Role Key Exposure

Containment:

1. Rotate the Supabase service-role key immediately.
2. Update Vercel environment variables.
3. Redeploy the app.
4. Search the repo and logs for accidental exposure.

Investigation:

```sql
SELECT created_at, event_type, severity, metadata
FROM public.operational_events
ORDER BY created_at DESC
LIMIT 100;
```

Recovery:

1. Verify public lead submission, rate limiting, user management, and PDF cache operations.
2. Review recent writes by time window for unusual changes.
3. Record a post-incident action item if the key was exposed in client code, logs, or docs.

### Role Split-Brain

Symptoms:

- User sees the wrong menu.
- User is denied a valid action.
- Alert type `split_brain_alert` or `role_change_failed`.

Diagnosis:

```sql
SELECT p.id, p.email, p.role AS db_role, u.raw_app_meta_data->>'role' AS auth_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.raw_app_meta_data->>'role' IS DISTINCT FROM p.role::text;
```

Recovery:

1. Log in as `admin` and use the repair action in User Management, or run `SELECT public.reconcile_user_roles();` with service-role privileges.
2. Ask the affected user to log out and log back in so JWT claims refresh.
3. Confirm the mismatch query returns no affected rows.

### Unauthorized Access Attempt

Symptoms:

- Repeated 401, 403, or `security_policy_violation` logs.
- Suspicious direct Supabase requests.

Containment:

1. Disable or downgrade the affected user if needed.
2. Confirm RLS policies match [Security Matrix](./SECURITY_MATRIX.md).
3. Check whether the operation was blocked at app layer, RLS layer, or both.

Validation:

```sql
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### PDF Rendering Outage

Symptoms:

- PDF endpoints return 429, 500, or 503.
- Browser launch failures.
- Render queue saturation.

Checklist:

1. Check `PDF_CHROMIUM_NO_SANDBOX`, `PDF_RENDER_LOCK_MODE`, and cache env vars.
2. Verify `pdf-route` rate-limit prefix exists in the database function by confirming migration `061` is applied.
3. Confirm `pdf_render_locks` exists if `PDF_RENDER_LOCK_MODE=database`.
4. Temporarily reduce traffic or ask users to retry cached documents.

Validation:

```sql
SELECT *
FROM public.pdf_render_locks
ORDER BY acquired_at DESC
LIMIT 20;
```

### Public Inquiry Failure

Symptoms:

- `/inquiry` submit fails.
- Public form cannot load active services or events.

Checklist:

1. Confirm `SUPABASE_SERVICE_ROLE_KEY` exists in server env.
2. Confirm `create_public_lead_rpc` execute is service-role only.
3. Confirm active services/events exist.
4. Check rate-limit denials for the submitter IP.

### Accounting Or Payment Data Drift

Symptoms:

- Order paid amount mismatches payments.
- Accounting entry missing for a payment or production job.

Containment:

1. Stop manual edits on the affected order.
2. Export the relevant order, payments, production jobs, and accounting entries.
3. Use RPC-backed actions for repair where possible.

Investigation:

```sql
SELECT id, total_amount, paid_amount, payment_status
FROM public.orders
WHERE id = '<order-id>';

SELECT *
FROM public.payments
WHERE order_id = '<order-id>'
ORDER BY payment_date;

SELECT *
FROM public.accounting_entries
WHERE linked_order_id = '<order-id>'
ORDER BY entry_date;
```

## Communication Template

```text
Status: Investigating | Mitigating | Resolved
Severity: SEV-1 | SEV-2 | SEV-3
Started: YYYY-MM-DD HH:mm TZ
Impact: Who is affected and what they cannot do
Current action: What the owner is doing now
Next update: Time
```

## Resolution Checklist

- [ ] User-facing impact has stopped.
- [ ] Root cause is known or bounded.
- [ ] Data integrity has been verified.
- [ ] Secrets have been rotated if exposure was possible.
- [ ] Tests or manual checks were run.
- [ ] Follow-up issue exists for permanent fixes.
- [ ] Incident notes include timeline, root cause, impact, and prevention.

## Post-Incident Review

Document:

- Timeline.
- Detection source.
- Root cause.
- Customer or staff impact.
- Data accessed or modified.
- What worked.
- What failed.
- Preventive changes.
