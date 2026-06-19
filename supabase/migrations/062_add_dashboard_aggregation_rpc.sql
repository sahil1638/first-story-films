-- Migration: 062_add_dashboard_aggregation_rpc.sql
-- Create the security-invoking view for orders with outstanding balances and percentage paid
CREATE OR REPLACE VIEW public.orders_with_outstanding
WITH (security_invoker = true)
AS
SELECT 
  id,
  couple_name,
  event_location,
  status,
  payment_status,
  total_amount,
  paid_amount,
  wedding_date,
  created_at,
  (COALESCE(total_amount, 0) - COALESCE(paid_amount, 0))::numeric AS outstanding_amount,
  CASE 
    WHEN COALESCE(total_amount, 0) > 0 THEN 
      LEAST(100, ROUND((COALESCE(paid_amount, 0) / COALESCE(total_amount, 0)) * 100))::integer
    ELSE 0::integer
  END AS paid_percent
FROM public.orders;

-- Create get_dashboard_totals RPC to calculate total bookings, receivables, income, and expenses in a single query
CREATE OR REPLACE FUNCTION public.get_dashboard_totals()
RETURNS TABLE (
  total_bookings numeric,
  total_receivable numeric,
  total_income numeric,
  total_expense numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE((SELECT SUM(total_amount) FROM public.orders WHERE status <> 'cancelled'), 0)::numeric AS total_bookings,
    COALESCE((SELECT SUM(total_amount - paid_amount) FROM public.orders WHERE status <> 'cancelled' AND total_amount > paid_amount), 0)::numeric AS total_receivable,
    CASE 
      WHEN public.current_user_role() IN ('admin', 'manager') THEN
        COALESCE((SELECT SUM(amount) FROM public.accounting_entries WHERE type = 'income'), 0)::numeric
      ELSE 0::numeric
    END AS total_income,
    CASE 
      WHEN public.current_user_role() IN ('admin', 'manager') THEN
        COALESCE((SELECT SUM(amount) FROM public.accounting_entries WHERE type = 'expense'), 0)::numeric
      ELSE 0::numeric
    END AS total_expense;
$$;

-- Grant execute permissions on the RPC to authenticated users
REVOKE ALL ON FUNCTION public.get_dashboard_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_totals() FROM anon;
REVOKE ALL ON FUNCTION public.get_dashboard_totals() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_totals() TO authenticated;
