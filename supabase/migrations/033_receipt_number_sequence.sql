-- Create receipt_number_sequences table to hold daily increment values
CREATE TABLE IF NOT EXISTS public.receipt_number_sequences (
  receipt_date date PRIMARY KEY,
  last_value integer NOT NULL
);

-- Enable Row Level Security to prevent direct client access
ALTER TABLE public.receipt_number_sequences ENABLE ROW LEVEL SECURITY;

-- Create function to generate sequential, transaction-safe receipt number
CREATE OR REPLACE FUNCTION public.next_receipt_number(receipt_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_val integer;
  v_date_str text;
BEGIN
  -- Insert or update last_value atomically
  INSERT INTO public.receipt_number_sequences (receipt_date, last_value)
  VALUES (next_receipt_number.receipt_date, 1)
  ON CONFLICT (receipt_date)
  DO UPDATE SET last_value = receipt_number_sequences.last_value + 1
  RETURNING last_value INTO v_next_val;

  v_date_str := to_char(next_receipt_number.receipt_date, 'YYYYMMDD');
  RETURN 'RCP-' || v_date_str || '-' || lpad(v_next_val::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM anon;
REVOKE ALL ON FUNCTION public.next_receipt_number(date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_receipt_number(date) TO authenticated;

-- Update add_order_payment RPC to use next_receipt_number(payment_date)
CREATE OR REPLACE FUNCTION public.add_order_payment(
  order_id uuid,
  amount numeric,
  payment_date date,
  notes text,
  created_by_user uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  total_amt numeric;
  paid_amt numeric;
  remaining numeric;
  created_by_id uuid := NULL;
  receipt_no text;
  new_payment_id uuid;
  account_id uuid;
  category_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero';
  END IF;

  SELECT total_amount INTO total_amt FROM public.orders WHERE id = order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF total_amt <= 0 THEN
    RAISE EXCEPTION 'Set the order total first before adding payments';
  END IF;

  SELECT COALESCE(SUM(payments.amount), 0) INTO paid_amt FROM public.payments WHERE payments.order_id = add_order_payment.order_id;
  remaining := total_amt - paid_amt;

  IF remaining <= 0 THEN
    RAISE EXCEPTION 'This order is already fully paid.';
  END IF;

  IF amount > remaining THEN
    RAISE EXCEPTION 'Payment cannot exceed remaining amount.';
  END IF;

  IF created_by_user IS NOT NULL THEN
    SELECT id INTO created_by_id FROM public.profiles WHERE id = created_by_user;
  END IF;

  -- Generate sequential, transaction-safe receipt number
  receipt_no := public.next_receipt_number(payment_date);

  INSERT INTO public.payments (order_id, amount, payment_date, receipt_number, notes, created_by)
  VALUES (order_id, amount, payment_date, receipt_no, notes, created_by_id)
  RETURNING id INTO new_payment_id;

  -- Get or create account
  SELECT id INTO account_id FROM public.accounting_accounts WHERE name = 'Order Transactions' LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.accounting_accounts (name, opening_balance, status)
    VALUES ('Order Transactions', 0, 'active')
    RETURNING id INTO account_id;
  END IF;

  -- Get or create category
  SELECT id INTO category_id FROM public.accounting_categories WHERE name = 'Order Payments' AND type = 'income' LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.accounting_categories (name, type, status)
    VALUES ('Order Payments', 'income', 'active')
    RETURNING id INTO category_id;
  END IF;

  INSERT INTO public.accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
  VALUES ('income', account_id, category_id, amount, payment_date, COALESCE(notes, 'Order payment'), 'order_payment', new_payment_id, created_by_id);

  -- Sync totals
  UPDATE public.orders
  SET
    paid_amount = (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = add_order_payment.order_id),
    payment_status = CASE
      WHEN (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = add_order_payment.order_id) <= 0 THEN 'unpaid'::public.payment_status
      WHEN total_amount > 0 AND (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = add_order_payment.order_id) >= total_amount THEN 'paid'::public.payment_status
      ELSE 'partial_paid'::public.payment_status
    END
  WHERE id = order_id;

  RETURN receipt_no;
END;
$$;
