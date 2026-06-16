-- Migration: 054_add_order_deliverables_test_tagging.sql
-- Adds test_run_id and created_by_test to order_deliverables and updates cleanup_test_data RPC.

-- 1. Add columns to order_deliverables
ALTER TABLE public.order_deliverables ADD COLUMN IF NOT EXISTS test_run_id UUID;
ALTER TABLE public.order_deliverables ADD COLUMN IF NOT EXISTS created_by_test BOOLEAN DEFAULT FALSE;

-- 2. Redefine cleanup_test_data RPC to clean up order_deliverables
CREATE OR REPLACE FUNCTION public.cleanup_test_data(p_test_run_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Expenses
  DELETE FROM public.expenses WHERE test_run_id = p_test_run_id;

  -- 2. Accounting Entries
  DELETE FROM public.accounting_entries WHERE test_run_id = p_test_run_id;

  -- 3. Accounting Accounts & Categories
  DELETE FROM public.accounting_accounts WHERE test_run_id = p_test_run_id;
  DELETE FROM public.accounting_categories WHERE test_run_id = p_test_run_id;

  -- 4. Invoices & Payments
  DELETE FROM public.invoices WHERE test_run_id = p_test_run_id;
  DELETE FROM public.payments WHERE test_run_id = p_test_run_id;

  -- 5. Production Jobs & Allocations / Deliverables
  DELETE FROM public.production_jobs WHERE test_run_id = p_test_run_id;
  DELETE FROM public.order_service_allocations WHERE test_run_id = p_test_run_id;
  DELETE FROM public.order_services WHERE test_run_id = p_test_run_id;
  DELETE FROM public.order_deliverables WHERE test_run_id = p_test_run_id;

  -- 6. Break circular reference between orders and customers
  UPDATE public.orders SET customer_id = NULL WHERE test_run_id = p_test_run_id;
  UPDATE public.customers SET order_id = NULL WHERE test_run_id = p_test_run_id;

  -- 7. Orders & Customers
  DELETE FROM public.orders WHERE test_run_id = p_test_run_id;
  DELETE FROM public.customers WHERE test_run_id = p_test_run_id;

  -- 8. Quotations (deliverables, service persons, function days)
  DELETE FROM public.quotation_deliverables WHERE test_run_id = p_test_run_id;
  DELETE FROM public.quotation_service_persons WHERE test_run_id = p_test_run_id;
  DELETE FROM public.quotation_function_day_services WHERE test_run_id = p_test_run_id;
  DELETE FROM public.quotation_function_days WHERE test_run_id = p_test_run_id;
  DELETE FROM public.quotations WHERE test_run_id = p_test_run_id;

  -- 9. Leads (function day services, function days)
  DELETE FROM public.lead_function_day_services WHERE test_run_id = p_test_run_id;
  DELETE FROM public.lead_function_days WHERE test_run_id = p_test_run_id;
  DELETE FROM public.leads WHERE test_run_id = p_test_run_id;

  -- 10. Agency & Crew Services
  DELETE FROM public.agency_services WHERE test_run_id = p_test_run_id;
  DELETE FROM public.crew_member_services WHERE test_run_id = p_test_run_id;

  -- 11. Services, Events, Deliverables, Agencies, Crew Members
  DELETE FROM public.services WHERE test_run_id = p_test_run_id;
  DELETE FROM public.events WHERE test_run_id = p_test_run_id;
  DELETE FROM public.deliverables WHERE test_run_id = p_test_run_id;
  DELETE FROM public.agencies WHERE test_run_id = p_test_run_id;
  DELETE FROM public.crew_members WHERE test_run_id = p_test_run_id;

  -- 12. Profiles
  DELETE FROM public.profiles WHERE test_run_id = p_test_run_id;
END;
$$;
