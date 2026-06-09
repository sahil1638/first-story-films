-- Fix: "new row violates row-level security policy for table leads"
-- Run in Supabase SQL Editor (optional if app uses service role for public form)

-- Anon needs SELECT after insert().select() on public inquiry form
DROP POLICY IF EXISTS "Public select public leads" ON leads;
CREATE POLICY "Public select public leads"
  ON leads FOR SELECT TO anon
  USING (source = 'public_form');

DROP POLICY IF EXISTS "Public select lead function days" ON lead_function_days;
CREATE POLICY "Public select lead function days"
  ON lead_function_days FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_function_days.lead_id
        AND leads.source = 'public_form'
    )
  );

DROP POLICY IF EXISTS "Public select lead day services" ON lead_function_day_services;
CREATE POLICY "Public select lead day services"
  ON lead_function_day_services FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM lead_function_days lfd
      JOIN leads l ON l.id = lfd.lead_id
      WHERE lfd.id = lead_function_day_services.lead_function_day_id
        AND l.source = 'public_form'
    )
  );
