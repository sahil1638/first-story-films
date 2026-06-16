-- Migration: 047_test_tagging_columns.sql
-- Adds test_run_id (UUID) and created_by_test (boolean) columns to all tables in the public schema
-- to enable safe identification and cleanup of test data.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles',
    'services',
    'events',
    'deliverables',
    'agencies',
    'agency_services',
    'crew_members',
    'crew_member_services',
    'settings',
    'leads',
    'lead_function_days',
    'lead_function_day_services',
    'quotations',
    'quotation_function_days',
    'quotation_function_day_services',
    'quotation_service_persons',
    'quotation_deliverables',
    'orders',
    'order_services',
    'order_service_allocations',
    'customers',
    'invoices',
    'payments',
    'production_jobs',
    'expenses',
    'accounting_categories',
    'accounting_accounts',
    'accounting_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS test_run_id UUID', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by_test BOOLEAN DEFAULT FALSE', t);
  END LOOP;
END
$$;
