# Security Matrix

This document captures the final intended role model after all migrations through `063_restrict_master_mutation_rls.sql`.

## Application Roles

| Role | Purpose |
|------|---------|
| `admin` | Full operational control, including user management |
| `manager` | Business management, accounting, customers, masters, and sales workflow |
| `sales` | Sales workflow: dashboard, leads, quotations, orders, and PDFs |

## UI Route Access

| Area | Route Prefix | Admin | Manager | Sales |
|------|--------------|-------|---------|-------|
| Dashboard | `/dashboard` | Yes | Yes | Yes |
| Public inquiry | `/inquiry` | Public | Public | Public |
| Leads | `/leads` | Yes | Yes | Yes |
| Quotations | `/quotations` | Yes | Yes | Yes |
| Orders | `/orders` | Yes | Yes | Yes |
| Masters | `/masters` | Yes | Yes | No |
| Accounting | `/accounting` | Yes | Yes | No |
| Customers | `/customers` | Yes | Yes | No |
| Settings | `/settings` | Yes | Yes | No |
| User management | `/users` | Yes | No | No |

Source: `src/lib/constants.ts` and `src/lib/auth/roles.ts`.

## API Route Access

| API Area | Routes | Admin | Manager | Sales | Public |
|----------|--------|-------|---------|-------|--------|
| Login | `POST /api/auth/login` | N/A | N/A | N/A | Yes |
| Logout | `POST /api/auth/logout` | Yes | Yes | Yes | No |
| Auth callback | `GET /auth/callback` | N/A | N/A | N/A | Yes |
| Accounting | `/api/accounting/**` | Yes | Yes | No | No |
| Masters | `/api/masters` | Yes | Yes | No | No |
| PDFs | `/api/**/pdf` | Yes | Yes | Yes | No |
| Maintenance reconcile | `/api/maintenance/reconcile` | Yes | No | No | Service bearer only |

## Database RLS Matrix

Legend: `S` = select, `I` = insert, `U` = update, `D` = delete, `RPC` = mutation must go through an RPC that performs its own role check.

| Data Area | Tables | Admin | Manager | Sales | Anon/Public | Notes |
|-----------|--------|-------|---------|-------|-------------|-------|
| Profiles | `profiles` | S/I/U/D | Own profile read/update where allowed | Own profile read/update where allowed | No | Admin can manage users; role escalation is trigger-protected. |
| Settings | `settings` | S/I/U/D | S/I/U/D | S | Limited read of public slug only where policy allows | App UI restricts settings to admin/manager. |
| Masters | `services`, `events`, `deliverables`, `agencies`, `agency_services`, `crew_members`, `crew_member_services` | S/I/U/D | S/I/U/D | S | Active public lookup only where intentionally allowed | Migration `063` restricts mutations to admin/manager. |
| Leads | `leads`, `lead_function_days`, `lead_function_day_services` | S/I/U/D | S/I/U/D | S/I/U | No direct table access | Migrations `057` to `059` deny Sales deletes. Public inquiry uses service-role RPC. |
| Quotations | `quotations`, `quotation_function_days`, `quotation_function_day_services`, `quotation_service_persons`, `quotation_deliverables` | S/I/U/D | S/I/U/D | S/I/U | No | Migrations `057` to `059` deny Sales deletes. |
| Orders | `orders`, `order_services`, `order_service_allocations`, `order_deliverables` | S/I/U/D | S/I/U/D | S/I | No | Direct Sales delete/update restricted for hardened order/payment surfaces; app actions enforce workflow checks. |
| Customers | `customers` | S/I/U/D | S/I/U/D | S | No | UI exposes customers only to admin/manager. |
| Invoices | `invoices`, invoice sequences | S/I/U/D | S/I/U/D | S | No | Sequence functions are permission-restricted. |
| Payments | `payments`, receipt sequences | S/I/U/D/RPC | S/I/U/D/RPC | S | No | Payment create/update/delete RPCs require admin/manager. |
| Production | `production_jobs` | S/I/U/D/RPC | S/I/U/D/RPC | S | No | Production job mutation RPCs require admin/manager. |
| Accounting | `accounting_accounts`, `accounting_categories`, `accounting_entries`, balance views | S/I/U/D/RPC | S/I/U/D/RPC | No | No | Migration `019` restricts accounting to admin/manager. |
| Rate limits | `rate_limits` | Service only | Service only | Service only | No | `check_rate_limit` execute is service-role only after migration `045` and `061`. |
| Operations | `operational_events`, `pdf_render_locks` | Service only | Service only | Service only | No | Used by server-side logging and distributed PDF render locks. |
| Test cleanup | test-tagged records, cleanup RPC | Service only | Service only | Service only | No | Cleanup RPC is service-role only. |

## RPC Authorization Summary

| RPC | Allowed Caller Role |
|-----|---------------------|
| `create_public_lead_rpc` | service role only |
| `check_rate_limit` | service role only |
| `reconcile_user_roles` | service role only |
| `convert_lead_to_quotation` | admin, manager, sales |
| `convert_quotation_to_order` | admin, manager, sales |
| `update_lead_with_function_days` | admin, manager, sales |
| `replace_quotation_selections` | admin, manager, sales |
| `delete_order_cascade` | admin, manager |
| `add_order_payment`, `update_order_payment`, `delete_order_payment` | admin, manager |
| `add_production_job`, `update_production_job`, `delete_production_job` | admin, manager |
| `update_accounting_entry_cascade`, `delete_accounting_entry_cascade` | admin, manager |
| `upsert_master_with_service_mappings` | admin, manager |
| `replace_order_service_allocations` | admin, manager |
| `get_dashboard_totals` | authenticated execute grant, role-filtered results |

## Security Invariants

- The browser only receives the Supabase anon key.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and must never use the `NEXT_PUBLIC_` prefix.
- Public lead creation must flow through the Next.js server and service-role RPC, not direct anon table inserts.
- Role claims are stored in Supabase Auth app metadata and mirrored in `public.profiles`; reconciliation repairs drift.
- App-layer guards are not a substitute for RLS. Both layers must remain aligned.
- PDF rendering must keep Chromium sandboxing enabled unless the runtime is isolated and explicitly acknowledged.

## Verification Queries

Run these in Supabase SQL Editor after migrations:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind IN ('r', 'p')
ORDER BY relname;
```

```sql
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

```sql
SELECT p.id, p.email, p.role AS db_role, u.raw_app_meta_data->>'role' AS auth_role
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.raw_app_meta_data->>'role' IS DISTINCT FROM p.role::text;
```
