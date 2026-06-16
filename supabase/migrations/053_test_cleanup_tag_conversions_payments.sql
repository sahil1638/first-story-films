-- Migration: 053_test_cleanup_tag_conversions_payments.sql
-- Redefines conversion, payment, and production job database functions to propagate test_run_id and created_by_test.
-- This ensures all child entities created in transaction blocks are correctly tagged and cleaned up.

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

  -- Validate amount is non-negative
  IF amount < 0 THEN
    RAISE EXCEPTION 'Quotation amount cannot be negative';
  END IF;

  SELECT * INTO lead_row FROM public.leads WHERE id = lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- Insert with admin_notes and test tagging columns included
  INSERT INTO public.quotations (
    status, your_name, couple_name, referral_source, contact_number, email,
    event_location, wedding_date, wedding_venue, album_requirement, drone_requirement,
    shooting_side, pre_wedding_shoot, functions_count, has_additional_info,
    additional_details, budget_range, original_lead_id, created_by, amount, admin_notes,
    test_run_id, created_by_test
  )
  VALUES (
    'pending', lead_row.your_name, lead_row.couple_name, lead_row.referral_source,
    lead_row.contact_number, lead_row.email, lead_row.event_location, lead_row.wedding_date,
    lead_row.wedding_venue, lead_row.album_requirement, lead_row.drone_requirement,
    lead_row.shooting_side, lead_row.pre_wedding_shoot, lead_row.functions_count,
    lead_row.has_additional_info, lead_row.additional_details, lead_row.budget_range,
    lead_id, created_by_user, amount, lead_row.admin_notes,
    lead_row.test_run_id, lead_row.created_by_test
  )
  RETURNING id INTO new_quotation_id;

  -- Copy function days
  FOR day_row IN 
    SELECT * FROM public.lead_function_days WHERE public.lead_function_days.lead_id = convert_lead_to_quotation.lead_id
  LOOP
    INSERT INTO public.quotation_function_days (
      quotation_id, day_index, day_date, first_event_id, second_event_id,
      test_run_id, created_by_test
    )
    VALUES (
      new_quotation_id, day_row.day_index, day_row.day_date, day_row.first_event_id, day_row.second_event_id,
      lead_row.test_run_id, lead_row.created_by_test
    )
    RETURNING id INTO new_day_id;

    -- Copy function day services
    INSERT INTO public.quotation_function_day_services (
      quotation_function_day_id, service_id,
      test_run_id, created_by_test
    )
    SELECT new_day_id, service_id, lead_row.test_run_id, lead_row.created_by_test
    FROM public.lead_function_day_services 
    WHERE lead_function_day_id = day_row.id;
  END LOOP;

  -- Save service person counts
  FOR sp IN SELECT * FROM jsonb_to_recordset(service_persons) AS (service_id uuid, person_count int) LOOP
    INSERT INTO public.quotation_service_persons (
      quotation_id, service_id, person_count,
      test_run_id, created_by_test
    )
    VALUES (new_quotation_id, sp.service_id, sp.person_count, lead_row.test_run_id, lead_row.created_by_test);
  END LOOP;

  -- Save selected deliverables
  FOREACH d_id IN ARRAY deliverable_ids LOOP
    INSERT INTO public.quotation_deliverables (
      quotation_id, deliverable_id,
      test_run_id, created_by_test
    )
    VALUES (new_quotation_id, d_id, lead_row.test_run_id, lead_row.created_by_test);
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

  -- Create order with admin_notes and test tagging columns included
  INSERT INTO public.orders (
    quotation_id, status, your_name, couple_name, contact_number, email,
    event_location, wedding_date, wedding_venue, budget_range,
    invoice_type, subtotal_amount, gst_rate, gst_amount, total_amount,
    paid_amount, payment_status, customer_id, created_by, admin_notes,
    test_run_id, created_by_test
  )
  VALUES (
    quotation_id, 'pending', quote_row.your_name, quote_row.couple_name, quote_row.contact_number, quote_row.email,
    quote_row.event_location, quote_row.wedding_date, quote_row.wedding_venue, quote_row.budget_range,
    invoice_type, subtotal, gst_rate, gst_amt, total_amt,
    0, 'unpaid', NULL, created_by_user, quote_row.admin_notes,
    quote_row.test_run_id, quote_row.created_by_test
  )
  RETURNING id INTO new_order_id;

  -- Create customer with test tagging columns included
  INSERT INTO public.customers (
    couple_name, contact_number, email, order_id,
    test_run_id, created_by_test
  )
  VALUES (
    quote_row.your_name, quote_row.contact_number, quote_row.email, new_order_id,
    quote_row.test_run_id, quote_row.created_by_test
  )
  RETURNING id INTO new_customer_id;

  -- Link customer back to order
  UPDATE public.orders SET customer_id = new_customer_id WHERE id = new_order_id;

  -- Insert order services with test tagging columns included
  FOR sp IN SELECT * FROM jsonb_to_recordset(service_persons) AS (service_id uuid, person_count int) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, person_count,
      test_run_id, created_by_test
    )
    VALUES (new_order_id, sp.service_id, sp.person_count, quote_row.test_run_id, quote_row.created_by_test);
  END LOOP;

  -- Insert order deliverables with test tagging columns included
  FOREACH d_id IN ARRAY deliverable_ids LOOP
    INSERT INTO public.order_deliverables (
      order_id, deliverable_id,
      test_run_id, created_by_test
    )
    VALUES (new_order_id, d_id, quote_row.test_run_id, quote_row.created_by_test);
  END LOOP;

  -- Mark quotation as converted
  UPDATE public.quotations SET status = 'convert_to_order' WHERE id = quotation_id;

  RETURN new_order_id;
END;
$$;


-- 3. add_order_payment
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
  v_test_run_id uuid;
  v_created_by_test boolean;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero';
  END IF;

  SELECT total_amount, test_run_id, created_by_test INTO total_amt, v_test_run_id, v_created_by_test FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF total_amt <= 0 THEN
    RAISE EXCEPTION 'Set the order total first before adding payments';
  END IF;

  SELECT COALESCE(SUM(payments.amount), 0) INTO paid_amt
  FROM public.payments
  WHERE payments.order_id = add_order_payment.order_id;

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

  receipt_no := public.next_receipt_number(payment_date);

  INSERT INTO public.payments (
    order_id, amount, payment_date, receipt_number, notes, created_by,
    test_run_id, created_by_test
  )
  VALUES (order_id, amount, payment_date, receipt_no, notes, created_by_id, v_test_run_id, v_created_by_test)
  RETURNING id INTO new_payment_id;

  account_id := public.ensure_system_account('Order Transactions');
  category_id := public.ensure_system_category('Order Payments', 'income');

  INSERT INTO public.accounting_entries (
    type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by,
    test_run_id, created_by_test
  )
  VALUES (
    'income', account_id, category_id, amount, payment_date, COALESCE(notes, 'Order payment'), 'order_payment', new_payment_id, created_by_id,
    v_test_run_id, v_created_by_test
  );

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


-- 4. update_order_payment
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
  v_test_run_id uuid;
  v_created_by_test boolean;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF amount <= 0 THEN
    RAISE EXCEPTION 'Enter a payment amount greater than zero';
  END IF;

  SELECT total_amount, test_run_id, created_by_test INTO total_amt, v_test_run_id, v_created_by_test FROM public.orders WHERE id = order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT created_by INTO created_by_user
  FROM public.payments
  WHERE id = payment_id AND payments.order_id = update_order_payment.order_id;
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

  account_id := public.ensure_system_account('Order Transactions');
  category_id := public.ensure_system_category('Order Payments', 'income');

  DELETE FROM public.accounting_entries WHERE source = 'order_payment' AND source_id = payment_id;
  INSERT INTO public.accounting_entries (
    type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by,
    test_run_id, created_by_test
  )
  VALUES (
    'income', account_id, category_id, amount, payment_date, COALESCE(notes, 'Order payment'), 'order_payment', payment_id, created_by_user,
    v_test_run_id, v_created_by_test
  );

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


-- 5. add_production_job
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
  v_test_run_id uuid;
  v_created_by_test boolean;
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

  SELECT test_run_id, created_by_test INTO v_test_run_id, v_created_by_test FROM public.orders WHERE id = order_id;

  INSERT INTO public.production_jobs (
    order_id, agency_id, service_id, payable_amount, created_by,
    test_run_id, created_by_test
  )
  VALUES (order_id, agency_id, service_id, payable_amount, created_by_user, v_test_run_id, v_created_by_test)
  RETURNING id, created_at INTO new_job_id, job_created_at;

  account_id := public.ensure_system_account('Order Transactions');
  category_id := public.ensure_system_category('Production Expenses', 'expense');

  INSERT INTO public.accounting_entries (
    type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by,
    test_run_id, created_by_test
  )
  VALUES (
    'expense', account_id, category_id, payable_amount, job_created_at::date, 'Production expense', 'production_job', new_job_id, created_by_user,
    v_test_run_id, v_created_by_test
  );

  RETURN new_job_id;
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
  v_test_run_id uuid;
  v_created_by_test boolean;
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

  SELECT created_by, created_at INTO created_by_user, job_created_at
  FROM public.production_jobs
  WHERE id = job_id AND production_jobs.order_id = update_production_job.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production job not found';
  END IF;

  SELECT test_run_id, created_by_test INTO v_test_run_id, v_created_by_test FROM public.orders WHERE id = order_id;

  UPDATE public.production_jobs
  SET
    agency_id = update_production_job.agency_id,
    service_id = update_production_job.service_id,
    payable_amount = update_production_job.payable_amount,
    status = update_production_job.status
  WHERE id = job_id AND production_jobs.order_id = update_production_job.order_id;

  account_id := public.ensure_system_account('Order Transactions');
  category_id := public.ensure_system_category('Production Expenses', 'expense');

  DELETE FROM public.accounting_entries WHERE source = 'production_job' AND source_id = job_id;
  INSERT INTO public.accounting_entries (
    type, account_id, category_id, amount, entry_date, remarks, source, source_id, created_by,
    test_run_id, created_by_test
  )
  VALUES (
    'expense', account_id, category_id, payable_amount, job_created_at::date, 'Production expense', 'production_job', job_id, created_by_user,
    v_test_run_id, v_created_by_test
  );
END;
$$;
