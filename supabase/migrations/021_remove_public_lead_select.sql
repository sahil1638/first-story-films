-- Remove public read access to submitted lead PII.
-- Public lead creation is handled server-side and returns only a confirmation id.

DROP POLICY IF EXISTS "Public select public leads" ON public.leads;
DROP POLICY IF EXISTS "Public select lead function days" ON public.lead_function_days;
DROP POLICY IF EXISTS "Public select lead day services" ON public.lead_function_day_services;
