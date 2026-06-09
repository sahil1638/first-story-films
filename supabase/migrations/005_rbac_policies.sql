-- Add stronger RBAC-aware row level security policies.
-- This migration tightens authenticated access and protects settings/user data.

-- Profiles: users can read their own profile, admins can read all.
DROP POLICY IF EXISTS "Authenticated full access" ON profiles;
DROP POLICY IF EXISTS "Authenticated full access" ON settings;

CREATE POLICY "Profiles select own or admin" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Profiles update self or admin" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.uid() = id OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Profiles delete admin only" ON profiles
  FOR DELETE TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Settings select authenticated role" ON settings
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager', 'sales'));

CREATE POLICY "Settings modify admin or manager" ON settings
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'manager'));

-- General authenticated access only when role metadata is valid.
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'services', 'events', 'deliverables', 'agencies', 'agency_services',
    'crew_members', 'crew_member_services', 'leads', 'lead_function_days',
    'lead_function_day_services', 'quotations', 'quotation_function_days',
    'quotation_function_day_services', 'quotation_service_persons',
    'quotation_deliverables', 'orders', 'order_services',
    'order_service_allocations', 'customers', 'invoices', 'payments',
    'production_jobs', 'expenses'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY "Authenticated role access" ON %I FOR ALL TO authenticated USING (auth.jwt() ->> ''role'' IN (''admin'', ''manager'', ''sales'')) WITH CHECK (auth.jwt() ->> ''role'' IN (''admin'', ''manager'', ''sales''))',
      tbl
    );
  END LOOP;
END $$;
