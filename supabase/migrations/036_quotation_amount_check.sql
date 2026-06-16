-- Add check constraints to prevent negative amounts on quotations and orders
ALTER TABLE public.quotations ADD CONSTRAINT quotations_amount_check CHECK (amount >= 0);
ALTER TABLE public.orders ADD CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0);

-- Update convert_lead_to_quotation function to add the negative amount check
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

-- Explicitly revoke and grant execution privileges
REVOKE ALL ON FUNCTION public.convert_lead_to_quotation(uuid, numeric, jsonb, uuid[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_lead_to_quotation(uuid, numeric, jsonb, uuid[], uuid) FROM anon;
REVOKE ALL ON FUNCTION public.convert_lead_to_quotation(uuid, numeric, jsonb, uuid[], uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_quotation(uuid, numeric, jsonb, uuid[], uuid) TO authenticated;
