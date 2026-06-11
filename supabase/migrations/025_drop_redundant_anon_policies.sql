-- Drop redundant public anon insert policies.
-- Public lead creation is handled server-side via Server Actions with Zod validation.
-- Direct anon inserts on tables bypasses application rate limits and schemas.

DROP POLICY IF EXISTS "Public insert leads" ON public.leads;
DROP POLICY IF EXISTS "Public insert lead days" ON public.lead_function_days;
DROP POLICY IF EXISTS "Public insert lead day services" ON public.lead_function_day_services;
