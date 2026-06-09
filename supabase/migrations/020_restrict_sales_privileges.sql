-- Migration: Harden security on masters, orders, payments, invoices, expenses, and production tables.
-- Restrict sales role to SELECT/INSERT on transaction tables and SELECT on master/production tables.

-- 1. Drop existing policies
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'services', 'events', 'deliverables', 'agencies', 'agency_services',
    'crew_members', 'crew_member_services', 'orders', 'order_services',
    'order_service_allocations', 'customers', 'invoices', 'payments',
    'production_jobs', 'expenses'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated role access" ON public.%I', tbl);
  END LOOP;
END $$;

-- 2. Configure policies for master tables (Read-only for sales, Full access for admin/manager)
DO $$
DECLARE
  tbl TEXT;
  master_tables TEXT[] := ARRAY[
    'services', 'events', 'deliverables', 'agencies', 'agency_services',
    'crew_members', 'crew_member_services'
  ];
BEGIN
  FOREACH tbl IN ARRAY master_tables LOOP
    EXECUTE format('
      CREATE POLICY "Select policy for authenticated roles" ON public.%I
        FOR SELECT TO authenticated
        USING (public.current_user_role() IN (''admin'', ''manager'', ''sales''))', tbl);

    EXECUTE format('
      CREATE POLICY "Modify policy for admin and manager" ON public.%I
        FOR ALL TO authenticated
        USING (public.current_user_role() IN (''admin'', ''manager''))
        WITH CHECK (public.current_user_role() IN (''admin'', ''manager''))', tbl);
  END LOOP;
END $$;

-- 3. Configure policies for transaction tables (Read/Insert for sales, Full access for admin/manager)
DO $$
DECLARE
  tbl TEXT;
  transaction_tables TEXT[] := ARRAY[
    'orders', 'order_services', 'order_service_allocations', 'customers', 'invoices', 'payments'
  ];
BEGIN
  FOREACH tbl IN ARRAY transaction_tables LOOP
    EXECUTE format('
      CREATE POLICY "Select policy for authenticated roles" ON public.%I
        FOR SELECT TO authenticated
        USING (public.current_user_role() IN (''admin'', ''manager'', ''sales''))', tbl);

    EXECUTE format('
      CREATE POLICY "Insert policy for authenticated roles" ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.current_user_role() IN (''admin'', ''manager'', ''sales''))', tbl);

    EXECUTE format('
      CREATE POLICY "Update and delete policy for admin and manager" ON public.%I
        FOR ALL TO authenticated
        USING (public.current_user_role() IN (''admin'', ''manager''))
        WITH CHECK (public.current_user_role() IN (''admin'', ''manager''))', tbl);
  END LOOP;
END $$;

-- 4. Configure policies for production and expenses (Read-only for sales, Full access for admin/manager)
DO $$
DECLARE
  tbl TEXT;
  production_tables TEXT[] := ARRAY[
    'production_jobs', 'expenses'
  ];
BEGIN
  FOREACH tbl IN ARRAY production_tables LOOP
    EXECUTE format('
      CREATE POLICY "Select policy for authenticated roles" ON public.%I
        FOR SELECT TO authenticated
        USING (public.current_user_role() IN (''admin'', ''manager'', ''sales''))', tbl);

    EXECUTE format('
      CREATE POLICY "Modify policy for admin and manager" ON public.%I
        FOR ALL TO authenticated
        USING (public.current_user_role() IN (''admin'', ''manager''))
        WITH CHECK (public.current_user_role() IN (''admin'', ''manager''))', tbl);
  END LOOP;
END $$;
