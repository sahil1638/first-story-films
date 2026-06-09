-- Migration: Harden RLS policies on accounting tables to restrict access to admin and manager roles.

-- 1. Drop old permissive policies
DROP POLICY IF EXISTS "Authenticated full access" ON public.accounting_categories;
DROP POLICY IF EXISTS "Authenticated full access" ON public.accounting_accounts;
DROP POLICY IF EXISTS "Authenticated full access" ON public.accounting_entries;

-- 2. Create new role-restricted policies
CREATE POLICY "Accounting access admin and manager only" ON public.accounting_categories
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Accounting access admin and manager only" ON public.accounting_accounts
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "Accounting access admin and manager only" ON public.accounting_entries
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));
