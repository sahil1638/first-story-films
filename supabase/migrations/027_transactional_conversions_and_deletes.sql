-- Transactional Conversions and Deletes SQL RPCs.

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
  IF public.current_user_role() NOT IN ('admin', 'manager', 'sales') THEN
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
  IF public.current_user_role() NOT IN ('admin', 'manager', 'sales') THEN
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
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
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
