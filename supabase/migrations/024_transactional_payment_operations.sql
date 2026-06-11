-- 1. add_order_payment
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
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
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

  receipt_no := 'RCP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 100000)::text, 5, '0');

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

-- 2. delete_order_payment
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
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
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

-- 3. update_order_payment
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
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero';
  END IF;

  SELECT total_amount INTO total_amt FROM public.orders WHERE id = order_id;
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

-- 4. add_production_job
CREATE OR REPLACE FUNCTION public.add_production_job(
  order_id uuid,
  agency_id uuid,
  service_id uuid,
  payable_amount numeric,
  created_by_user uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_job_id uuid;
  job_created_at timestamptz;
  account_id uuid;
  category_id uuid;
BEGIN
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  INSERT INTO public.production_jobs (order_id, agency_id, service_id, payable_amount, created_by)
  VALUES (order_id, agency_id, service_id, payable_amount, created_by_user)
  RETURNING id, created_at INTO new_job_id, job_created_at;

  -- Get or create account
  SELECT id INTO account_id FROM public.accounting_accounts WHERE name = 'Order Transactions' LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.accounting_accounts (name, opening_balance, status)
    VALUES ('Order Transactions', 0, 'active')
    RETURNING id INTO account_id;
  END IF;

  -- Get or create category
  SELECT id INTO category_id FROM public.accounting_categories WHERE name = 'Production Expenses' AND type = 'expense' LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.accounting_categories (name, type, status)
    VALUES ('Production Expenses', 'expense', 'active')
    RETURNING id INTO category_id;
  END IF;

  INSERT INTO public.accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
  VALUES ('expense', account_id, category_id, payable_amount, job_created_at::date, 'Production expense', 'production_job', new_job_id, created_by_user);

  RETURN new_job_id;
END;
$$;

-- 5. delete_production_job
CREATE OR REPLACE FUNCTION public.delete_production_job(
  job_id uuid,
  order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  DELETE FROM public.production_jobs WHERE id = job_id AND production_jobs.order_id = delete_production_job.order_id;
  DELETE FROM public.accounting_entries WHERE source = 'production_job' AND source_id = job_id;
END;
$$;

-- 6. update_production_job
CREATE OR REPLACE FUNCTION public.update_production_job(
  job_id uuid,
  order_id uuid,
  agency_id uuid,
  service_id uuid,
  payable_amount numeric,
  status public.production_job_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  created_by_user uuid;
  job_created_at timestamptz;
  account_id uuid;
  category_id uuid;
BEGIN
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF agency_id IS NULL OR service_id IS NULL THEN
    RAISE EXCEPTION 'Select agency and service';
  END IF;

  IF payable_amount <= 0 THEN
    RAISE EXCEPTION 'Enter a valid payable amount';
  END IF;

  SELECT created_by, created_at INTO created_by_user, job_created_at FROM public.production_jobs WHERE id = job_id AND production_jobs.order_id = update_production_job.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production job not found';
  END IF;

  UPDATE public.production_jobs
  SET
    agency_id = update_production_job.agency_id,
    service_id = update_production_job.service_id,
    payable_amount = update_production_job.payable_amount,
    status = update_production_job.status
  WHERE id = job_id AND production_jobs.order_id = update_production_job.order_id;

  -- Get or create account
  SELECT id INTO account_id FROM public.accounting_accounts WHERE name = 'Order Transactions' LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.accounting_accounts (name, opening_balance, status)
    VALUES ('Order Transactions', 0, 'active')
    RETURNING id INTO account_id;
  END IF;

  -- Get or create category
  SELECT id INTO category_id FROM public.accounting_categories WHERE name = 'Production Expenses' AND type = 'expense' LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.accounting_categories (name, type, status)
    VALUES ('Production Expenses', 'expense', 'active')
    RETURNING id INTO category_id;
  END IF;

  DELETE FROM public.accounting_entries WHERE source = 'production_job' AND source_id = job_id;
  INSERT INTO public.accounting_entries (type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by)
  VALUES ('expense', account_id, category_id, payable_amount, job_created_at::date, 'Production expense', 'production_job', job_id, created_by_user);
END;
$$;
