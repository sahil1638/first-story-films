-- Remove stale FOR ALL policies that can override the split SELECT/INSERT/UPDATE/DELETE policies.
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
    EXECUTE format('DROP POLICY IF EXISTS "Modify policy for admin and manager" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Delete policy for admin and manager" ON public.%I', tbl);

    EXECUTE format(
      'CREATE POLICY "Delete policy for admin and manager" ON public.%I
       FOR DELETE TO authenticated
       USING (public.current_user_role() IN (''admin'', ''manager''))',
      tbl
    );
  END LOOP;
END $$;
