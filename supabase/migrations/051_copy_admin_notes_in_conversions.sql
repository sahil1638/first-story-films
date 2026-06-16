-- Migration: 051_copy_admin_notes_in_conversions.sql
-- Updates lead-to-quotation and quotation-to-order conversion RPCs to preserve admin_notes.

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

  -- Insert with admin_notes included
  INSERT INTO public.quotations (
    status, your_name, couple_name, referral_source, contact_number, email,
    event_location, wedding_date, wedding_venue, album_requirement, drone_requirement,
    shooting_side, pre_wedding_shoot, functions_count, has_additional_info,
    additional_details, budget_range, original_lead_id, created_by, amount, admin_notes
  )
  VALUES (
    'pending', lead_row.your_name, lead_row.couple_name, lead_row.referral_source,
    lead_row.contact_number, lead_row.email, lead_row.event_location, lead_row.wedding_date,
    lead_row.wedding_venue, lead_row.album_requirement, lead_row.drone_requirement,
    lead_row.shooting_side, lead_row.pre_wedding_shoot, lead_row.functions_count,
    lead_row.has_additional_info, lead_row.additional_details, lead_row.budget_range,
    lead_id, created_by_user, amount, lead_row.admin_notes
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

-- Enforce execute privileges on convert_lead_to_quotation
REVOKE ALL ON FUNCTION public.convert_lead_to_quotation(uuid, numeric, jsonb, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_quotation(uuid, numeric, jsonb, uuid[], uuid) TO authenticated;


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

  -- Create order with admin_notes included
  INSERT INTO public.orders (
    quotation_id, status, your_name, couple_name, contact_number, email,
    event_location, wedding_date, wedding_venue, budget_range,
    invoice_type, subtotal_amount, gst_rate, gst_amount, total_amount,
    paid_amount, payment_status, customer_id, created_by, admin_notes
  )
  VALUES (
    quotation_id, 'pending', quote_row.your_name, quote_row.couple_name, quote_row.contact_number, quote_row.email,
    quote_row.event_location, quote_row.wedding_date, quote_row.wedding_venue, quote_row.budget_range,
    invoice_type, subtotal, gst_rate, gst_amt, total_amt,
    0, 'unpaid', NULL, created_by_user, quote_row.admin_notes
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

-- Enforce execute privileges on convert_quotation_to_order
REVOKE ALL ON FUNCTION public.convert_quotation_to_order(uuid, numeric, public.invoice_type, jsonb, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_order(uuid, numeric, public.invoice_type, jsonb, uuid[], uuid) TO authenticated;
