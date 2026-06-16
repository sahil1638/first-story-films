-- Harden security definer functions to prevent NULL role bypass.
-- If public.current_user_role() is NULL (unauthenticated), NOT IN check behaves as NULL/unknown and skips exception raising.
-- Adding explicit IS NULL OR NOT IN checks ensures unauthenticated access is blocked.

-- 1. convert_lead_to_quotation
CREATE OR REPLACE FUNCTION public.convert_lead_to_quotation(
  lead_id uuid,
  amount numeric,
  service_persons jsonb,
  deliverable_ids uuid[],
  created_by_user uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_quotation_id uuid;
  lead_row public.leads%ROWTYPE;
  day_row RECORD;
  new_day_id uuid;
  sp RECORD;
  d_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Unauthorized: Sales or higher required';
  END IF;

  SELECT * INTO lead_row FROM public.leads WHERE id = lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  INSERT INTO public.quotations (
    status, your_name, couple_name, referral_source, contact_number, email,
    event_location, wedding_date, wedding_venue, album_requirement, drone_requirement,
    shooting_side, pre_wedding_shoot, functions_count, has_additional_info,
    additional_details, budget_range, original_lead_id, created_by, amount
  )
  VALUES (
    'pending', lead_row.your_name, lead_row.couple_name, lead_row.referral_source,
    lead_row.contact_number, lead_row.email, lead_row.event_location, lead_row.wedding_date,
    lead_row.wedding_venue, lead_row.album_requirement, lead_row.drone_requirement,
    lead_row.shooting_side, lead_row.pre_wedding_shoot, lead_row.functions_count,
    lead_row.has_additional_info, lead_row.additional_details, lead_row.budget_range,
    lead_id, created_by_user, amount
  )
  RETURNING id INTO new_quotation_id;

  -- Copy function days
  FOR day_row IN 
    SELECT * FROM public.lead_function_days WHERE public.lead_function_days.lead_id = convert_lead_to_quotation.lead_id
  LOOP
    INSERT INTO public.quotation_function_days (quotation_id, day_index, day_date, first_event_id, second_event_id)
    VALUES (new_quotation_id, day_row.day_index, day_row.day_date, day_row.first_event_id, day_row.second_event_id)
    RETURNING id INTO new_day_id;

    -- Copy function day services
    INSERT INTO public.quotation_function_day_services (quotation_function_day_id, service_id)
    SELECT new_day_id, service_id 
    FROM public.lead_function_day_services 
    WHERE lead_function_day_id = day_row.id;
  END LOOP;

  -- Save service person counts
  FOR sp IN SELECT * FROM jsonb_to_recordset(service_persons) AS (service_id uuid, person_count int) LOOP
    INSERT INTO public.quotation_service_persons (quotation_id, service_id, person_count)
    VALUES (new_quotation_id, sp.service_id, sp.person_count);
  END LOOP;

  -- Save selected deliverables
  FOREACH d_id IN ARRAY deliverable_ids LOOP
    INSERT INTO public.quotation_deliverables (quotation_id, deliverable_id)
    VALUES (new_quotation_id, d_id);
  END LOOP;

  -- Delete the lead
  DELETE FROM public.leads WHERE id = lead_id;

  RETURN new_quotation_id;
END;
$$;


-- 2. convert_quotation_to_order
CREATE OR REPLACE FUNCTION public.convert_quotation_to_order(
  quotation_id uuid,
  subtotal numeric,
  invoice_type public.invoice_type,
  service_persons jsonb,
  deliverable_ids uuid[],
  created_by_user uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_order_id uuid;
  new_customer_id uuid;
  quote_row public.quotations%ROWTYPE;
  gst_rate numeric := 18;
  gst_amt numeric;
  total_amt numeric;
  sp RECORD;
  d_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Unauthorized: Sales or higher required';
  END IF;

  SELECT * INTO quote_row FROM public.quotations WHERE id = quotation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF quote_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending quotations can be converted to orders';
  END IF;

  IF invoice_type = 'gst' THEN
    gst_amt := subtotal * (gst_rate / 100);
  ELSE
    gst_rate := 0;
    gst_amt := 0;
  END IF;
  total_amt := subtotal + gst_amt;

  -- Create order
  INSERT INTO public.orders (
    quotation_id, status, your_name, couple_name, contact_number, email,
    event_location, wedding_date, wedding_venue, budget_range,
    invoice_type, subtotal_amount, gst_rate, gst_amount, total_amount,
    paid_amount, payment_status, customer_id, created_by
  )
  VALUES (
    quotation_id, 'pending', quote_row.your_name, quote_row.couple_name, quote_row.contact_number, quote_row.email,
    quote_row.event_location, quote_row.wedding_date, quote_row.wedding_venue, quote_row.budget_range,
    invoice_type, subtotal, gst_rate, gst_amt, total_amt,
    0, 'unpaid', NULL, created_by_user
  )
  RETURNING id INTO new_order_id;

  -- Create customer
  INSERT INTO public.customers (couple_name, contact_number, email, order_id)
  VALUES (quote_row.your_name, quote_row.contact_number, quote_row.email, new_order_id)
  RETURNING id INTO new_customer_id;

  -- Link customer back to order
  UPDATE public.orders SET customer_id = new_customer_id WHERE id = new_order_id;

  -- Insert order services
  FOR sp IN SELECT * FROM jsonb_to_recordset(service_persons) AS (service_id uuid, person_count int) LOOP
    INSERT INTO public.order_services (order_id, service_id, person_count)
    VALUES (new_order_id, sp.service_id, sp.person_count);
  END LOOP;

  -- Insert order deliverables
  FOREACH d_id IN ARRAY deliverable_ids LOOP
    INSERT INTO public.order_deliverables (order_id, deliverable_id)
    VALUES (new_order_id, d_id);
  END LOOP;

  -- Mark quotation as converted
  UPDATE public.quotations SET status = 'convert_to_order' WHERE id = quotation_id;

  RETURN new_order_id;
END;
$$;


-- 3. delete_order_cascade
CREATE OR REPLACE FUNCTION public.delete_order_cascade(order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  payment_ids uuid[];
  job_ids uuid[];
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  -- Fetch payments and production jobs associated with the order
  SELECT array_agg(id) INTO payment_ids FROM public.payments WHERE public.payments.order_id = delete_order_cascade.order_id;
  SELECT array_agg(id) INTO job_ids FROM public.production_jobs WHERE public.production_jobs.order_id = delete_order_cascade.order_id;

  -- Delete associated accounting entries
  IF payment_ids IS NOT NULL AND array_length(payment_ids, 1) > 0 THEN
    DELETE FROM public.accounting_entries WHERE source = 'order_payment' AND source_id = ANY(payment_ids);
  END IF;

  IF job_ids IS NOT NULL AND array_length(job_ids, 1) > 0 THEN
    DELETE FROM public.accounting_entries WHERE source = 'production_job' AND source_id = ANY(job_ids);
  END IF;

  -- Nullify customer_id to break cycle
  UPDATE public.orders SET customer_id = NULL WHERE id = order_id;

  -- Delete customer
  DELETE FROM public.customers WHERE public.customers.order_id = delete_order_cascade.order_id;

  -- Delete order (cascades to child tables: payments, production_jobs, order_services, etc.)
  DELETE FROM public.orders WHERE id = order_id;
END;
$$;


-- 4. add_order_payment
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


-- 5. delete_order_payment
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


-- 6. update_order_payment
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


-- 7. add_production_job
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
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
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


-- 8. delete_production_job
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
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  DELETE FROM public.production_jobs WHERE id = job_id AND production_jobs.order_id = delete_production_job.order_id;
  DELETE FROM public.accounting_entries WHERE source = 'production_job' AND source_id = job_id;
END;
$$;


-- 9. update_production_job
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
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
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


-- 10. update_accounting_entry_cascade
CREATE OR REPLACE FUNCTION public.update_accounting_entry_cascade(
  entry_id uuid,
  new_amount numeric,
  new_entry_date date,
  new_remarks text
)
RETURNS TABLE (
  out_order_id uuid,
  out_source text,
  out_source_id uuid
)
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
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  -- Fetch existing entry with row locking
  SELECT amount, entry_date, remarks, source, source_id
  INTO v_existing_amount, v_existing_entry_date, v_existing_remarks, v_source, v_source_id
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

  -- Handle linked update workflows
  IF v_source = 'order_payment' AND v_source_id IS NOT NULL THEN
    -- Fetch the payment and lock it
    SELECT payments.order_id INTO v_order_id FROM public.payments WHERE id = v_source_id FOR UPDATE;
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
    SELECT production_jobs.order_id INTO v_order_id FROM public.production_jobs WHERE id = v_source_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked production job not found';
    END IF;

    -- Update the production job's payable amount
    UPDATE public.production_jobs
    SET
      payable_amount = new_amount
    WHERE id = v_source_id;
  END IF;

  -- Update the accounting entry itself
  UPDATE public.accounting_entries
  SET
    amount = new_amount,
    entry_date = new_entry_date,
    remarks = new_remarks
  WHERE id = entry_id;

  -- Sync order totals if it was a payment
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

  out_order_id := v_order_id;
  out_source := v_source;
  out_source_id := v_source_id;
  RETURN NEXT;
END;
$$;


-- 11. delete_accounting_entry_cascade
CREATE OR REPLACE FUNCTION public.delete_accounting_entry_cascade(
  entry_id uuid
)
RETURNS TABLE (
  out_order_id uuid,
  out_source text,
  out_source_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source text;
  v_source_id uuid;
  v_order_id uuid;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  -- Fetch with row locking to prevent race conditions
  SELECT source, source_id INTO v_source, v_source_id
  FROM public.accounting_entries
  WHERE id = entry_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounting entry not found';
  END IF;

  -- Handle linked workflows
  IF v_source = 'order_payment' AND v_source_id IS NOT NULL THEN
    SELECT payments.order_id INTO v_order_id FROM public.payments WHERE id = v_source_id FOR UPDATE;
    IF FOUND THEN
      DELETE FROM public.payments WHERE id = v_source_id;
    END IF;
  ELSIF v_source = 'production_job' AND v_source_id IS NOT NULL THEN
    SELECT production_jobs.order_id INTO v_order_id FROM public.production_jobs WHERE id = v_source_id FOR UPDATE;
    IF FOUND THEN
      DELETE FROM public.production_jobs WHERE id = v_source_id;
    END IF;
  END IF;

  -- Delete the entry itself
  DELETE FROM public.accounting_entries WHERE id = entry_id;

  -- Sync order totals if it was a payment
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

  out_order_id := v_order_id;
  out_source := v_source;
  out_source_id := v_source_id;
  RETURN NEXT;
END;
$$;
