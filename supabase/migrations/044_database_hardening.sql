-- Migration: 044_database_hardening.sql
-- Revoke all default privileges on the accounting balance view from PUBLIC and anonymous users,
-- and explicitly grant SELECT access to authenticated users and service_role.

REVOKE ALL ON public.accounting_accounts_with_balances FROM PUBLIC, anon;
GRANT SELECT ON public.accounting_accounts_with_balances TO authenticated, service_role;
