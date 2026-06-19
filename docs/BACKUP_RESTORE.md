# Backup And Restore Procedure

This application stores source code in Git, runtime configuration in deployment/Supabase settings, and business data in Supabase Postgres plus optional Supabase Storage for PDF cache objects.

## Recovery Objectives

| Item | Target |
|------|--------|
| Source code | Recover from Git history |
| Database schema | Recover from ordered migrations in `supabase/migrations` |
| Database data | Recover from Supabase backups, point-in-time recovery, or verified dumps |
| Environment variables | Recover from Vercel and Supabase dashboard configuration |
| PDF cache | Rebuildable; do not treat as authoritative data |

## What Must Be Backed Up

| Asset | Backup Source |
|-------|---------------|
| Postgres data | Supabase automated backups or `pg_dump` |
| Supabase Auth users | Included in full database backup; verify Auth schema coverage for export method |
| Storage bucket `pdf-cache` | Optional; cache can be regenerated |
| Environment variables | Vercel project env export or secure password manager |
| Migration files | Git repository |

## Routine Backup Checks

Weekly:

- [ ] Confirm Supabase automated backups are enabled for production.
- [ ] Confirm the backup retention period matches the business requirement.
- [ ] Confirm at least one recent backup can be restored into a non-production project.
- [ ] Confirm `supabase migration list` shows production is current.
- [ ] Confirm environment variables are recorded in a secure credential store.

Monthly:

- [ ] Perform a test restore into a staging Supabase project.
- [ ] Run `npm run test:ci` against the restored environment where safe.
- [ ] Verify login, public inquiry, lead-to-quotation, quotation-to-order, payment, and PDF flows.

## Pre-Migration Backup

Before running production migrations:

1. Confirm the target project reference.
2. Confirm no long-running incident is active.
3. Take or verify a fresh Supabase backup.
4. Export critical tables if the migration touches accounting, orders, auth, or RLS.
5. Run migrations locally with `supabase db reset`.
6. Run `npm run test:ci`.
7. Apply with `supabase db push`.

Critical table export examples:

```bash
pg_dump "$DATABASE_URL" --data-only --table=public.orders --table=public.payments --table=public.accounting_entries > critical-finance-data.sql
```

Keep dumps encrypted and delete local copies after the retention window.

## Restore To Staging

Use this path to validate backups without affecting production.

1. Create a new Supabase project or reset an existing staging project.
2. Apply migrations from the repository:

```bash
supabase link --project-ref <staging-project-ref>
supabase db push
```

3. Restore the backup through Supabase dashboard tooling or `psql`, depending on the backup format.
4. Configure staging env vars in Vercel or `.env.local`.
5. Run smoke validation:

```bash
npm run test:ci
npm run build
```

6. Manually verify:

- Login as admin, manager, and sales.
- Public inquiry submission.
- Lead conversion to quotation.
- Quotation conversion to order.
- Payment add/update/delete.
- PDF generation.
- Accounting exports.

## Production Restore

Use production restore only for SEV-1 data loss or corruption.

1. Declare an incident and assign an owner.
2. Put the app into maintenance mode at the hosting layer if available, or pause traffic.
3. Identify the restore target timestamp or backup snapshot.
4. Export current production data before overwriting anything, even if corrupted.
5. Restore using Supabase point-in-time recovery or backup restore.
6. Reapply any migrations missing from the restored snapshot:

```bash
supabase migration list
supabase db push
```

7. Rotate credentials if compromise is suspected.
8. Redeploy the app.
9. Run post-restore validation.
10. Reopen traffic.

## Post-Restore Validation

Database:

```sql
SELECT COUNT(*) FROM public.profiles;
SELECT COUNT(*) FROM public.leads;
SELECT COUNT(*) FROM public.quotations;
SELECT COUNT(*) FROM public.orders;
SELECT COUNT(*) FROM public.payments;
SELECT COUNT(*) FROM public.accounting_entries;
```

RLS and functions:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind IN ('r', 'p')
ORDER BY relname;

SELECT has_function_privilege('public.check_rate_limit(text, numeric, numeric, numeric)', 'execute');
SELECT has_function_privilege('public.reconcile_user_roles()', 'execute');
```

Auth consistency:

```sql
SELECT p.id, p.email, p.role AS db_role, u.raw_app_meta_data->>'role' AS auth_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.raw_app_meta_data->>'role' IS DISTINCT FROM p.role::text;
```

Application:

- [ ] Admin can log in.
- [ ] Manager can access accounting and masters.
- [ ] Sales cannot access accounting, customers, settings, masters, or users.
- [ ] Public inquiry creates a lead.
- [ ] PDF endpoints return `application/pdf`.
- [ ] Accounting exports return CSV.
- [ ] Operational alerts still deliver.

## Rollback Notes

- Code rollback is separate from data restore. Prefer reverting a deployment before restoring data.
- Database migrations should be forward-fixed when possible.
- If a destructive migration caused data loss, stop and restore from backup rather than attempting manual reconstruction.
- Do not restore the `pdf-cache` bucket unless a storage restore is already part of a broader Supabase recovery. PDFs are generated artifacts.
