-- Migration: 048_test_cleanup_rpc.sql
-- Creates the cleanup_test_data RPC function to perform fast, single-transaction cleanup of test data in correct dependency order.

CREATE OR REPLACE FUNCTION public.cleanup_test_data(p_test_run_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Expenses
  DELETE FROM public.expenses WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 2. Accounting Entries
  DELETE FROM public.accounting_entries WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 3. Accounting Accounts & Categories
  DELETE FROM public.accounting_accounts WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.accounting_categories WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 4. Invoices & Payments
  DELETE FROM public.invoices WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.payments WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 5. Production Jobs & Allocations
  DELETE FROM public.production_jobs WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.order_service_allocations WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.order_services WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 6. Break circular reference between orders and customers
  UPDATE public.orders SET customer_id = NULL WHERE test_run_id = p_test_run_id OR created_by_test = true;
  UPDATE public.customers SET order_id = NULL WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 7. Orders & Customers
  DELETE FROM public.orders WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.customers WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 8. Quotations (deliverables, service persons, function days)
  DELETE FROM public.quotation_deliverables WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.quotation_service_persons WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.quotation_function_day_services WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.quotation_function_days WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.quotations WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 9. Leads (function day services, function days)
  DELETE FROM public.lead_function_day_services WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.lead_function_days WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.leads WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 10. Agency & Crew Services
  DELETE FROM public.agency_services WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.crew_member_services WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 11. Services, Events, Deliverables, Agencies, Crew Members
  DELETE FROM public.services WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.events WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.deliverables WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.agencies WHERE test_run_id = p_test_run_id OR created_by_test = true;
  DELETE FROM public.crew_members WHERE test_run_id = p_test_run_id OR created_by_test = true;

  -- 12. Profiles
  DELETE FROM public.profiles WHERE test_run_id = p_test_run_id OR created_by_test = true;
END;
$$;

-- Restrict execution to service_role only
REVOKE EXECUTE ON FUNCTION public.cleanup_test_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_test_data(UUID) TO service_role;
