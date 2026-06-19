-- Migration: 057_harden_leads_quotations_rls.sql
-- Harden RLS policies on leads, quotations, and their child tables.
-- Restricts UPDATE/DELETE to admin and manager, allows SELECT/INSERT to sales, and blocks all anon access.

-- 1. Drop existing authenticated role access policies
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'leads', 'lead_function_days', 'lead_function_day_services',
    'quotations', 'quotation_function_days', 'quotation_function_day_services',
    'quotation_service_persons', 'quotation_deliverables'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated role access" ON public.%I', tbl);
  END LOOP;
END $$;

-- 2. Explicitly drop any remaining public/anonymous policies to prevent public read/write
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'leads', 'lead_function_days', 'lead_function_day_services',
    'quotations', 'quotation_function_days', 'quotation_function_day_services',
    'quotation_service_persons', 'quotation_deliverables'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public select public leads" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public select lead function days" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public select lead day services" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public insert leads" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public insert lead days" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Public insert lead day services" ON public.%I', tbl);
  END LOOP;
END $$;

-- 3. Configure hardened policies (SELECT/INSERT for authenticated staff, UPDATE/DELETE for admin/manager)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'leads', 'lead_function_days', 'lead_function_day_services',
    'quotations', 'quotation_function_days', 'quotation_function_day_services',
    'quotation_service_persons', 'quotation_deliverables'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Enable RLS (defense in depth)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- SELECT policy for authenticated roles (admin, manager, sales)
    EXECUTE format('
      CREATE POLICY "Select policy for authenticated roles" ON public.%I
        FOR SELECT TO authenticated
        USING (public.current_user_role() IN (''admin'', ''manager'', ''sales''))', tbl);

    -- INSERT policy for authenticated roles (admin, manager, sales)
    EXECUTE format('
      CREATE POLICY "Insert policy for authenticated roles" ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.current_user_role() IN (''admin'', ''manager'', ''sales''))', tbl);

    -- UPDATE and DELETE policy for admin and manager
    EXECUTE format('
      CREATE POLICY "Update and delete policy for admin and manager" ON public.%I
        FOR ALL TO authenticated
        USING (public.current_user_role() IN (''admin'', ''manager''))
        WITH CHECK (public.current_user_role() IN (''admin'', ''manager''))', tbl);
  END LOOP;
END $$;
