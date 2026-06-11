-- Transactional Accounting Entry Updates and Deletes

-- 1. update_accounting_entry_cascade
CREATE OR REPLACE FUNCTION public.update_accounting_entry_cascade(
  entry_id uuid,
  new_amount numeric,
  new_entry_date date,
  new_remarks text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source text;
  v_source_id uuid;
  v_order_id uuid;
  v_total_amt numeric;
  v_paid_excluding numeric;
  v_existing_amount numeric;
  v_existing_entry_date date;
  v_existing_remarks text;
BEGIN
  -- 1. Explicit role check: require admin or manager
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  -- 2. Fetch existing entry with row locking
  SELECT source, source_id, amount, entry_date, remarks
  INTO v_source, v_source_id, v_existing_amount, v_existing_entry_date, v_existing_remarks
  FROM public.accounting_entries
  WHERE id = entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounting entry not found';
  END IF;

  -- Use new values if provided, otherwise fall back to existing
  IF new_amount IS NULL THEN
    new_amount := v_existing_amount;
  END IF;
  IF new_entry_date IS NULL THEN
    new_entry_date := v_existing_entry_date;
  END IF;
  IF new_remarks IS NULL THEN
    new_remarks := v_existing_remarks;
  END IF;

  IF new_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- 3. Handle linked update workflows
  IF v_source = 'order_payment' AND v_source_id IS NOT NULL THEN
    -- Fetch the payment and lock it
    SELECT order_id INTO v_order_id FROM public.payments WHERE id = v_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked payment not found';
    END IF;

    -- Fetch order and check remaining amount limit
    SELECT total_amount INTO v_total_amt FROM public.orders WHERE id = v_order_id FOR UPDATE;
    
    SELECT COALESCE(SUM(payments.amount), 0) INTO v_paid_excluding 
    FROM public.payments 
    WHERE payments.order_id = v_order_id AND id <> v_source_id;

    IF v_paid_excluding + new_amount > v_total_amt THEN
      RAISE EXCEPTION 'Payment cannot exceed remaining amount.';
    END IF;

    -- Update the payment
    UPDATE public.payments
    SET
      amount = new_amount,
      payment_date = new_entry_date,
      notes = new_remarks
    WHERE id = v_source_id;

  ELSIF v_source = 'production_job' AND v_source_id IS NOT NULL THEN
    -- Fetch the production job and lock it
    SELECT order_id INTO v_order_id FROM public.production_jobs WHERE id = v_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked production job not found';
    END IF;

    -- Update the production job's payable amount
    UPDATE public.production_jobs
    SET
      payable_amount = new_amount
    WHERE id = v_source_id;
  END IF;

  -- 4. Update the accounting entry itself
  UPDATE public.accounting_entries
  SET
    amount = new_amount,
    entry_date = new_entry_date,
    remarks = new_remarks
  WHERE id = entry_id;

  -- 5. Sync order totals if it was a payment
  IF v_source = 'order_payment' AND v_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET
      paid_amount = (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = v_order_id),
      payment_status = CASE
        WHEN (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = v_order_id) <= 0 THEN 'unpaid'::public.payment_status
        WHEN total_amount > 0 AND (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = v_order_id) >= total_amount THEN 'paid'::public.payment_status
        ELSE 'partial_paid'::public.payment_status
      END
    WHERE id = v_order_id;
  END IF;
END;
$$;


-- 2. delete_accounting_entry_cascade
CREATE OR REPLACE FUNCTION public.delete_accounting_entry_cascade(
  entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source text;
  v_source_id uuid;
  v_order_id uuid;
BEGIN
  -- 1. Explicit role check: require admin or manager
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  -- 2. Fetch with row locking to prevent race conditions
  SELECT source, source_id INTO v_source, v_source_id
  FROM public.accounting_entries
  WHERE id = entry_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounting entry not found';
  END IF;

  -- 3. Handle linked workflows
  IF v_source = 'order_payment' AND v_source_id IS NOT NULL THEN
    SELECT order_id INTO v_order_id FROM public.payments WHERE id = v_source_id FOR UPDATE;
    IF FOUND THEN
      DELETE FROM public.payments WHERE id = v_source_id;
    END IF;
  ELSIF v_source = 'production_job' AND v_source_id IS NOT NULL THEN
    SELECT order_id INTO v_order_id FROM public.production_jobs WHERE id = v_source_id FOR UPDATE;
    IF FOUND THEN
      DELETE FROM public.production_jobs WHERE id = v_source_id;
    END IF;
  END IF;

  -- 4. Delete the entry itself
  DELETE FROM public.accounting_entries WHERE id = entry_id;

  -- 5. Sync order totals if it was a payment
  IF v_source = 'order_payment' AND v_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET
      paid_amount = (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = v_order_id),
      payment_status = CASE
        WHEN (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = v_order_id) <= 0 THEN 'unpaid'::public.payment_status
        WHEN total_amount > 0 AND (SELECT COALESCE(SUM(payments.amount), 0) FROM public.payments WHERE payments.order_id = v_order_id) >= total_amount THEN 'paid'::public.payment_status
        ELSE 'partial_paid'::public.payment_status
      END
    WHERE id = v_order_id;
  END IF;
END;
$$;
