-- Remove legacy broad master-data policies and enforce read-only sales access.
DO $$
DECLARE
  tbl text;
  master_tables text[] := ARRAY[
    'services',
    'events',
    'deliverables',
    'agencies',
    'agency_services',
    'crew_members',
    'crew_member_services',
    'settings'
  ];
BEGIN
  FOREACH tbl IN ARRAY master_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated role access" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Select policy for authenticated roles" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Modify policy for admin and manager" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Settings select authenticated role" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Settings modify admin manager" ON public.%I', tbl);

    EXECUTE format(
      'CREATE POLICY "Select policy for authenticated roles" ON public.%I
       FOR SELECT TO authenticated
       USING (public.current_user_role() IN (''admin'', ''manager'', ''sales''))',
      tbl
    );

    EXECUTE format(
      'CREATE POLICY "Modify policy for admin and manager" ON public.%I
       FOR ALL TO authenticated
       USING (public.current_user_role() IN (''admin'', ''manager''))
       WITH CHECK (public.current_user_role() IN (''admin'', ''manager''))',
      tbl
    );
  END LOOP;
END $$;
