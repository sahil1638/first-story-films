-- Create role helper function that returns the enum type in public schema
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
DECLARE
  role_str text;
BEGIN
  role_str := auth.jwt() -> 'app_metadata' ->> 'role';
  IF role_str IS NULL OR role_str = '' THEN
    RETURN NULL;
  END IF;
  RETURN role_str::public.user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Re-create RLS Policies to use public.current_user_role()
-- Profiles:
DROP POLICY IF EXISTS "Profiles select own or admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update self or admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles delete admin only" ON public.profiles;

CREATE POLICY "Profiles select own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.current_user_role() = 'admin');

CREATE POLICY "Profiles update self or admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.current_user_role() = 'admin')
  WITH CHECK (auth.uid() = id OR public.current_user_role() = 'admin');

CREATE POLICY "Profiles delete admin only" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- Settings:
DROP POLICY IF EXISTS "Settings select authenticated role" ON public.settings;
DROP POLICY IF EXISTS "Settings modify admin or manager" ON public.settings;

CREATE POLICY "Settings select authenticated role" ON public.settings
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'sales'));

CREATE POLICY "Settings modify admin or manager" ON public.settings
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));

-- Other tables:
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
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated role access" ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY "Authenticated role access" ON public.%I FOR ALL TO authenticated USING (public.current_user_role() IN (''admin'', ''manager'', ''sales'')) WITH CHECK (public.current_user_role() IN (''admin'', ''manager'', ''sales''))',
      tbl
    );
  END LOOP;
END $$;
