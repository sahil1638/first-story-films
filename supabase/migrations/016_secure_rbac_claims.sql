-- 1. Create function to sync profiles.role to auth.users.raw_app_meta_data
CREATE OR REPLACE FUNCTION public.sync_profile_to_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role::text)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- 2. Create trigger on public.profiles
DROP TRIGGER IF EXISTS on_profile_role_sync ON public.profiles;
CREATE TRIGGER on_profile_role_sync
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_auth_user();

-- 3. Run a one-time migration to sync all existing user profiles' roles to raw_app_meta_data
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role::text)
FROM public.profiles p
WHERE auth.users.id = p.id;

-- 4. Re-create RLS Policies to use auth.jwt() -> 'app_metadata' ->> 'role'
-- Profiles:
DROP POLICY IF EXISTS "Profiles select own or admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update self or admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles delete admin only" ON public.profiles;

CREATE POLICY "Profiles select own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

CREATE POLICY "Profiles update self or admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  WITH CHECK (auth.uid() = id OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

CREATE POLICY "Profiles delete admin only" ON public.profiles
  FOR DELETE TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Settings:
DROP POLICY IF EXISTS "Settings select authenticated role" ON public.settings;
DROP POLICY IF EXISTS "Settings modify admin or manager" ON public.settings;

CREATE POLICY "Settings select authenticated role" ON public.settings
  FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'manager', 'sales'));

CREATE POLICY "Settings modify admin or manager" ON public.settings
  FOR ALL TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'manager'))
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'manager'));

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
      'CREATE POLICY "Authenticated role access" ON public.%I FOR ALL TO authenticated USING (auth.jwt() -> ''app_metadata'' ->> ''role'' IN (''admin'', ''manager'', ''sales'')) WITH CHECK (auth.jwt() -> ''app_metadata'' ->> ''role'' IN (''admin'', ''manager'', ''sales''))',
      tbl
    );
  END LOOP;
END $$;
