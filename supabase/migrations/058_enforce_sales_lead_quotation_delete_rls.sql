-- Re-apply the lead/quotation Sales delete hardening under a fresh migration version.
-- Some linked environments already have a 057 migration recorded, so this file makes
-- the effective policy state explicit and deployable.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'leads',
    'lead_function_days',
    'lead_function_day_services',
    'quotations',
    'quotation_function_days',
    'quotation_function_day_services',
    'quotation_service_persons',
    'quotation_deliverables'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated role access" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Select policy for authenticated roles" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Insert policy for authenticated roles" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Update policy for authenticated roles" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Delete policy for admin and manager" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Modify policy for admin and manager" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Update and delete policy for admin and manager" ON public.%I', tbl);

    EXECUTE format(
      'CREATE POLICY "Select policy for authenticated roles" ON public.%I
       FOR SELECT TO authenticated
       USING (public.current_user_role() IN (''admin'', ''manager'', ''sales''))',
      tbl
    );

    EXECUTE format(
      'CREATE POLICY "Insert policy for authenticated roles" ON public.%I
       FOR INSERT TO authenticated
       WITH CHECK (public.current_user_role() IN (''admin'', ''manager'', ''sales''))',
      tbl
    );

    EXECUTE format(
      'CREATE POLICY "Update policy for authenticated roles" ON public.%I
       FOR UPDATE TO authenticated
       USING (public.current_user_role() IN (''admin'', ''manager'', ''sales''))
       WITH CHECK (public.current_user_role() IN (''admin'', ''manager'', ''sales''))',
      tbl
    );

    EXECUTE format(
      'CREATE POLICY "Delete policy for admin and manager" ON public.%I
       FOR DELETE TO authenticated
       USING (public.current_user_role() IN (''admin'', ''manager''))',
      tbl
    );
  END LOOP;
END $$;
