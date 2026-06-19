-- Final cleanup for legacy policy names observed on deployed projects.
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
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Update and delete policy for admin and manager" ON public.%I', tbl);
  END LOOP;
END $$;
