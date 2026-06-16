-- 1. add_order_payment with row locking
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

  -- Acquire ROW lock on parent order row to prevent concurrent payment additions/updates/deletions on the same order
  SELECT total_amount INTO total_amt FROM public.orders WHERE id = order_id FOR UPDATE;
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

-- Ensure execution permissions on add_order_payment are maintained
REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_payment(uuid, numeric, date, text, uuid) TO authenticated;


-- 2. update_order_payment with row locking
CREATE OR REPLACE FUNCTION public.update_order_payment(
  payment_id uuid,
  order_id uuid,
  amount numeric,
  payment_date date,
  notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  total_amt numeric;
  paid_excluding numeric;
  created_by_user uuid;
  account_id uuid;
  category_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero';
  END IF;

  -- Acquire ROW lock on parent order row to prevent concurrent payment additions/updates/deletions on the same order
  SELECT total_amount INTO total_amt FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT created_by INTO created_by_user FROM public.payments WHERE id = payment_id AND payments.order_id = update_order_payment.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT COALESCE(SUM(payments.amount), 0) INTO paid_excluding 
  FROM public.payments 
  WHERE payments.order_id = update_order_payment.order_id AND id <> payment_id;

  IF paid_excluding + amount > total_amt THEN
    RAISE EXCEPTION 'Payment cannot exceed remaining amount.';
  END IF;

  UPDATE public.payments
  SET
    amount = update_order_payment.amount,
    payment_date = update_order_payment.payment_date,
    notes = update_order_payment.notes
  WHERE id = payment_id AND payments.order_id = update_order_payment.order_id;

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

  DELETE FROM public.accounting_entries WHERE source = 'order_payment' AND source_id = payment_id;
  INSERT INTO public.accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
  VALUES ('income', account_id, category_id, amount, payment_date, COALESCE(notes, 'Order payment'), 'order_payment', payment_id, created_by_user);

  -- Sync totals
  UPDATE public.orders
  SET
    paid_amount = (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = update_order_payment.order_id),
    payment_status = CASE
      WHEN (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = update_order_payment.order_id) <= 0 THEN 'unpaid'::public.payment_status
      WHEN total_amount > 0 AND (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = update_order_payment.order_id) >= total_amount THEN 'paid'::public.payment_status
      ELSE 'partial_paid'::public.payment_status
    END
  WHERE id = order_id;
END;
$$;

-- Ensure execution permissions on update_order_payment are maintained
REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_payment(uuid, uuid, numeric, date, text) TO authenticated;


-- 3. delete_order_payment with row locking
CREATE OR REPLACE FUNCTION public.delete_order_payment(
  payment_id uuid,
  order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  -- Acquire ROW lock on parent order row to prevent concurrent payment additions/updates/deletions on the same order
  PERFORM 1 FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  DELETE FROM public.payments WHERE id = payment_id AND payments.order_id = delete_order_payment.order_id;
  DELETE FROM public.accounting_entries WHERE source = 'order_payment' AND source_id = payment_id;

  -- Sync totals
  UPDATE public.orders
  SET
    paid_amount = (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = delete_order_payment.order_id),
    payment_status = CASE
      WHEN (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = delete_order_payment.order_id) <= 0 THEN 'unpaid'::public.payment_status
      WHEN total_amount > 0 AND (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = delete_order_payment.order_id) >= total_amount THEN 'paid'::public.payment_status
      ELSE 'partial_paid'::public.payment_status
    END
  WHERE id = order_id;
END;
$$;

-- Ensure execution permissions on delete_order_payment are maintained
REVOKE ALL ON FUNCTION public.delete_order_payment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_order_payment(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_order_payment(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_order_payment(uuid, uuid) TO authenticated;


-- 4. check_rate_limit with advisory locking
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  limit_key text,
  max_tokens numeric,
  refill_rate_per_sec numeric,
  cost numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  now_time timestamptz := now();
  curr_tokens numeric;
  last_refill timestamptz;
  elapsed_sec numeric;
  new_tokens numeric;
BEGIN
  -- Validate key prefix and length to prevent key bloat attacks
  IF limit_key IS NULL OR length(limit_key) > 100 THEN
    RAISE EXCEPTION 'Invalid rate limit key: key cannot be null or exceed 100 characters';
  END IF;

  -- Allowed prefixes: login, public-lead, pdf, export
  IF split_part(limit_key, ':', 1) NOT IN ('login', 'public-lead', 'pdf', 'export') THEN
    RAISE EXCEPTION 'Invalid rate limit key prefix';
  END IF;

  -- Acquire exclusive transaction-level advisory lock on the rate limit key hash
  PERFORM pg_advisory_xact_lock(hashtext(limit_key));

  SELECT tokens, last_refilled_at INTO curr_tokens, last_refill
  FROM public.rate_limits
  WHERE key = limit_key;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (key, tokens, last_refilled_at)
    VALUES (limit_key, max_tokens - cost, now_time);
    RETURN TRUE;
  END IF;

  elapsed_sec := extract(epoch from (now_time - last_refill));
  new_tokens := curr_tokens + (elapsed_sec * refill_rate_per_sec);
  IF new_tokens > max_tokens THEN
    new_tokens := max_tokens;
  END IF;

  IF new_tokens < cost THEN
    -- Refill current tokens without consuming
    UPDATE public.rate_limits
    SET tokens = new_tokens, last_refilled_at = now_time
    WHERE key = limit_key;
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits
  SET tokens = new_tokens - cost, last_refilled_at = now_time
  WHERE key = limit_key;
  RETURN TRUE;
END;
$$;

-- Ensure execution permissions on check_rate_limit are maintained
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) TO anon, authenticated;


-- 5. Safe creation and scheduling of pg_cron cleanup job
DO $$
DECLARE
  cron_exists boolean;
BEGIN
  -- Check if pg_cron extension is available in this PostgreSQL environment
  SELECT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) INTO cron_exists;

  IF cron_exists THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      
      -- Check if pg_cron is successfully installed and the 'cron' schema exists
      IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
        BEGIN
          -- Safely unschedule any existing cron job with the same name before scheduling to ensure idempotency
          IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-rate-limits') THEN
            PERFORM cron.unschedule('cleanup-expired-rate-limits');
          END IF;
          
          -- Schedule the cleanup job to run hourly
          PERFORM cron.schedule(
            'cleanup-expired-rate-limits',
            '0 * * * *', -- Every hour
            $job$DELETE FROM public.rate_limits WHERE last_refilled_at < now() - INTERVAL '24 hours'$job$
          );
          RAISE NOTICE 'pg_cron job cleanup-expired-rate-limits scheduled successfully.';
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'pg_cron functions are not fully available or accessible: %', SQLERRM;
        END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to create pg_cron extension: %', SQLERRM;
    END;
  ELSE
    RAISE WARNING 'pg_cron extension is not available in pg_available_extensions.';
  END IF;
END;
$$;
