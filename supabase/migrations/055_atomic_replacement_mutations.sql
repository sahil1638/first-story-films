-- Migration: 055_atomic_replacement_mutations.sql
-- Moves delete-then-insert replacement workflows into transactional RPCs.

CREATE OR REPLACE FUNCTION public.update_lead_with_function_days(
  p_lead_id uuid,
  p_lead jsonb,
  p_function_days jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  lead_row public.leads%ROWTYPE;
  day_item jsonb;
  service_id uuid;
  new_day_id uuid;
  first_event_id uuid;
  second_event_id uuid;
  unique_event_ids uuid[] := '{}';
  unique_service_ids uuid[] := '{}';
  event_count int;
  service_count int;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Unauthorized: Sales or higher required';
  END IF;

  IF jsonb_typeof(p_function_days) <> 'array' OR jsonb_array_length(p_function_days) = 0 THEN
    RAISE EXCEPTION 'At least one function day is required';
  END IF;

  SELECT * INTO lead_row
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  IF (p_lead->>'functions_count')::int <> jsonb_array_length(p_function_days) THEN
    RAISE EXCEPTION 'Function day count must match functions count';
  END IF;

  FOR day_item IN SELECT jsonb_array_elements(p_function_days) LOOP
    first_event_id := (day_item->>'first_event_id')::uuid;
    second_event_id := (day_item->>'second_event_id')::uuid;

    IF first_event_id IS NULL THEN
      RAISE EXCEPTION 'First event is required';
    END IF;

    IF NOT (first_event_id = ANY(unique_event_ids)) THEN
      unique_event_ids := array_append(unique_event_ids, first_event_id);
    END IF;

    IF second_event_id IS NOT NULL AND NOT (second_event_id = ANY(unique_event_ids)) THEN
      unique_event_ids := array_append(unique_event_ids, second_event_id);
    END IF;

    FOR service_id IN
      SELECT DISTINCT value::uuid
      FROM jsonb_array_elements_text(COALESCE(day_item->'service_ids', '[]'::jsonb)) AS value
    LOOP
      IF NOT (service_id = ANY(unique_service_ids)) THEN
        unique_service_ids := array_append(unique_service_ids, service_id);
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(unique_event_ids, 1) > 0 THEN
    SELECT COUNT(*) INTO event_count
    FROM public.events
    WHERE id = ANY(unique_event_ids) AND status = 'active';

    IF event_count <> array_length(unique_event_ids, 1) THEN
      RAISE EXCEPTION 'One or more selected events are unavailable';
    END IF;
  END IF;

  IF array_length(unique_service_ids, 1) > 0 THEN
    SELECT COUNT(*) INTO service_count
    FROM public.services
    WHERE id = ANY(unique_service_ids) AND status = 'active';

    IF service_count <> array_length(unique_service_ids, 1) THEN
      RAISE EXCEPTION 'One or more selected services are unavailable';
    END IF;
  END IF;

  UPDATE public.leads
  SET
    your_name = p_lead->>'your_name',
    couple_name = p_lead->>'couple_name',
    referral_source = p_lead->>'referral_source',
    contact_number = p_lead->>'contact_number',
    email = NULLIF(p_lead->>'email', ''),
    event_location = p_lead->>'event_location',
    wedding_date = (p_lead->>'wedding_date')::date,
    wedding_venue = NULLIF(p_lead->>'wedding_venue', ''),
    album_requirement = p_lead->>'album_requirement',
    drone_requirement = p_lead->>'drone_requirement',
    shooting_side = p_lead->>'shooting_side',
    pre_wedding_shoot = p_lead->>'pre_wedding_shoot',
    functions_count = (p_lead->>'functions_count')::int,
    has_additional_info = (p_lead->>'has_additional_info')::boolean,
    additional_details = NULLIF(p_lead->>'additional_details', ''),
    budget_range = p_lead->>'budget_range',
    status = CASE
      WHEN p_lead ? 'status' THEN (p_lead->>'status')::public.lead_status
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = p_lead_id;

  DELETE FROM public.lead_function_days WHERE lead_id = p_lead_id;

  FOR day_item IN SELECT jsonb_array_elements(p_function_days) LOOP
    INSERT INTO public.lead_function_days (
      lead_id,
      day_index,
      day_date,
      first_event_id,
      second_event_id,
      test_run_id,
      created_by_test
    )
    VALUES (
      p_lead_id,
      (day_item->>'day_index')::int,
      (day_item->>'day_date')::date,
      (day_item->>'first_event_id')::uuid,
      (day_item->>'second_event_id')::uuid,
      lead_row.test_run_id,
      lead_row.created_by_test
    )
    RETURNING id INTO new_day_id;

    INSERT INTO public.lead_function_day_services (
      lead_function_day_id,
      service_id,
      test_run_id,
      created_by_test
    )
    SELECT DISTINCT
      new_day_id,
      value::uuid,
      lead_row.test_run_id,
      lead_row.created_by_test
    FROM jsonb_array_elements_text(COALESCE(day_item->'service_ids', '[]'::jsonb)) AS value;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_quotation_selections(
  p_quotation_id uuid,
  p_deliverable_ids uuid[],
  p_service_persons jsonb,
  p_replace_deliverables boolean,
  p_replace_service_persons boolean,
  p_filter_service_persons_to_selected boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  quote_row public.quotations%ROWTYPE;
  sp RECORD;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Unauthorized: Sales or higher required';
  END IF;

  SELECT * INTO quote_row
  FROM public.quotations
  WHERE id = p_quotation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF p_replace_deliverables THEN
    DELETE FROM public.quotation_deliverables WHERE quotation_id = p_quotation_id;

    INSERT INTO public.quotation_deliverables (
      quotation_id,
      deliverable_id,
      test_run_id,
      created_by_test
    )
    SELECT DISTINCT
      p_quotation_id,
      deliverable_id,
      quote_row.test_run_id,
      quote_row.created_by_test
    FROM unnest(COALESCE(p_deliverable_ids, ARRAY[]::uuid[])) AS deliverable_id;
  END IF;

  IF p_replace_service_persons THEN
    IF jsonb_typeof(COALESCE(p_service_persons, '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'Service persons must be an array';
    END IF;

    DELETE FROM public.quotation_service_persons WHERE quotation_id = p_quotation_id;

    FOR sp IN
      SELECT service_id, MAX(person_count)::int AS person_count
      FROM jsonb_to_recordset(COALESCE(p_service_persons, '[]'::jsonb))
        AS item(service_id uuid, person_count int)
      WHERE service_id IS NOT NULL
      GROUP BY service_id
    LOOP
      IF sp.person_count IS NULL OR sp.person_count < 1 THEN
        RAISE EXCEPTION 'Person count must be at least 1';
      END IF;

      IF p_filter_service_persons_to_selected AND NOT EXISTS (
        SELECT 1
        FROM public.quotation_function_days qfd
        JOIN public.quotation_function_day_services qfds
          ON qfds.quotation_function_day_id = qfd.id
        WHERE qfd.quotation_id = p_quotation_id
          AND qfds.service_id = sp.service_id
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.quotation_service_persons (
        quotation_id,
        service_id,
        person_count,
        test_run_id,
        created_by_test
      )
      VALUES (
        p_quotation_id,
        sp.service_id,
        sp.person_count,
        quote_row.test_run_id,
        quote_row.created_by_test
      );
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_master_with_service_mappings(
  p_table text,
  p_id uuid,
  p_data jsonb,
  p_service_ids uuid[],
  p_test_run_id uuid,
  p_created_by_test boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_id uuid;
  parent_test_run_id uuid;
  parent_created_by_test boolean;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  IF p_table NOT IN ('services', 'events', 'deliverables', 'agencies', 'crew_members') THEN
    RAISE EXCEPTION 'Unsupported master table';
  END IF;

  IF p_table = 'services' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.services (name, description, status, test_run_id, created_by_test)
      VALUES (
        p_data->>'name',
        NULLIF(p_data->>'description', ''),
        COALESCE((p_data->>'status')::public.record_status, 'active'),
        p_test_run_id,
        COALESCE(p_created_by_test, false)
      )
      RETURNING id INTO target_id;
    ELSE
      UPDATE public.services
      SET
        name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
        description = CASE WHEN p_data ? 'description' THEN NULLIF(p_data->>'description', '') ELSE description END,
        status = CASE WHEN p_data ? 'status' THEN (p_data->>'status')::public.record_status ELSE status END,
        updated_at = NOW()
      WHERE id = p_id
      RETURNING id INTO target_id;
    END IF;
  ELSIF p_table = 'events' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.events (name, status, test_run_id, created_by_test)
      VALUES (
        p_data->>'name',
        COALESCE((p_data->>'status')::public.record_status, 'active'),
        p_test_run_id,
        COALESCE(p_created_by_test, false)
      )
      RETURNING id INTO target_id;
    ELSE
      UPDATE public.events
      SET
        name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
        status = CASE WHEN p_data ? 'status' THEN (p_data->>'status')::public.record_status ELSE status END,
        updated_at = NOW()
      WHERE id = p_id
      RETURNING id INTO target_id;
    END IF;
  ELSIF p_table = 'deliverables' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.deliverables (title, status, test_run_id, created_by_test)
      VALUES (
        p_data->>'title',
        COALESCE((p_data->>'status')::public.record_status, 'active'),
        p_test_run_id,
        COALESCE(p_created_by_test, false)
      )
      RETURNING id INTO target_id;
    ELSE
      UPDATE public.deliverables
      SET
        title = CASE WHEN p_data ? 'title' THEN p_data->>'title' ELSE title END,
        status = CASE WHEN p_data ? 'status' THEN (p_data->>'status')::public.record_status ELSE status END,
        updated_at = NOW()
      WHERE id = p_id
      RETURNING id INTO target_id;
    END IF;
  ELSIF p_table = 'agencies' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.agencies (
        company_name,
        person_name,
        contact_number,
        address,
        status,
        test_run_id,
        created_by_test
      )
      VALUES (
        p_data->>'company_name',
        p_data->>'person_name',
        p_data->>'contact_number',
        NULLIF(p_data->>'address', ''),
        COALESCE((p_data->>'status')::public.record_status, 'active'),
        p_test_run_id,
        COALESCE(p_created_by_test, false)
      )
      RETURNING id, test_run_id, created_by_test INTO target_id, parent_test_run_id, parent_created_by_test;
    ELSE
      UPDATE public.agencies
      SET
        company_name = CASE WHEN p_data ? 'company_name' THEN p_data->>'company_name' ELSE company_name END,
        person_name = CASE WHEN p_data ? 'person_name' THEN p_data->>'person_name' ELSE person_name END,
        contact_number = CASE WHEN p_data ? 'contact_number' THEN p_data->>'contact_number' ELSE contact_number END,
        address = CASE WHEN p_data ? 'address' THEN NULLIF(p_data->>'address', '') ELSE address END,
        status = CASE WHEN p_data ? 'status' THEN (p_data->>'status')::public.record_status ELSE status END,
        updated_at = NOW()
      WHERE id = p_id
      RETURNING id, test_run_id, created_by_test INTO target_id, parent_test_run_id, parent_created_by_test;
    END IF;

    IF target_id IS NULL THEN
      RAISE EXCEPTION 'Master record not found';
    END IF;

    DELETE FROM public.agency_services WHERE agency_id = target_id;

    INSERT INTO public.agency_services (agency_id, service_id, test_run_id, created_by_test)
    SELECT DISTINCT
      target_id,
      mapped_service_id,
      parent_test_run_id,
      parent_created_by_test
    FROM unnest(COALESCE(p_service_ids, ARRAY[]::uuid[])) AS mapped_service_id;
  ELSIF p_table = 'crew_members' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.crew_members (
        name,
        contact_number,
        address,
        status,
        test_run_id,
        created_by_test
      )
      VALUES (
        p_data->>'name',
        p_data->>'contact_number',
        NULLIF(p_data->>'address', ''),
        COALESCE((p_data->>'status')::public.record_status, 'active'),
        p_test_run_id,
        COALESCE(p_created_by_test, false)
      )
      RETURNING id, test_run_id, created_by_test INTO target_id, parent_test_run_id, parent_created_by_test;
    ELSE
      UPDATE public.crew_members
      SET
        name = CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
        contact_number = CASE WHEN p_data ? 'contact_number' THEN p_data->>'contact_number' ELSE contact_number END,
        address = CASE WHEN p_data ? 'address' THEN NULLIF(p_data->>'address', '') ELSE address END,
        status = CASE WHEN p_data ? 'status' THEN (p_data->>'status')::public.record_status ELSE status END,
        updated_at = NOW()
      WHERE id = p_id
      RETURNING id, test_run_id, created_by_test INTO target_id, parent_test_run_id, parent_created_by_test;
    END IF;

    IF target_id IS NULL THEN
      RAISE EXCEPTION 'Master record not found';
    END IF;

    DELETE FROM public.crew_member_services WHERE crew_member_id = target_id;

    INSERT INTO public.crew_member_services (crew_member_id, service_id, test_run_id, created_by_test)
    SELECT DISTINCT
      target_id,
      mapped_service_id,
      parent_test_run_id,
      parent_created_by_test
    FROM unnest(COALESCE(p_service_ids, ARRAY[]::uuid[])) AS mapped_service_id;
  END IF;

  IF target_id IS NULL THEN
    RAISE EXCEPTION 'Master record not found';
  END IF;

  RETURN target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_order_service_allocations(
  p_order_id uuid,
  p_order_service_id uuid,
  p_crew_member_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  service_test_run_id uuid;
  service_created_by_test boolean;
BEGIN
  IF public.current_user_role() IS NULL OR public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized: Manager or admin access required';
  END IF;

  SELECT test_run_id, created_by_test
  INTO service_test_run_id, service_created_by_test
  FROM public.order_services
  WHERE id = p_order_service_id
    AND order_id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order service not found';
  END IF;

  DELETE FROM public.order_service_allocations WHERE order_service_id = p_order_service_id;

  INSERT INTO public.order_service_allocations (
    order_service_id,
    crew_member_id,
    test_run_id,
    created_by_test
  )
  SELECT DISTINCT
    p_order_service_id,
    crew_member_id,
    service_test_run_id,
    service_created_by_test
  FROM unnest(COALESCE(p_crew_member_ids, ARRAY[]::uuid[])) AS crew_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_lead_with_function_days(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_lead_with_function_days(uuid, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.replace_quotation_selections(uuid, uuid[], jsonb, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_quotation_selections(uuid, uuid[], jsonb, boolean, boolean, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_master_with_service_mappings(text, uuid, jsonb, uuid[], uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_master_with_service_mappings(text, uuid, jsonb, uuid[], uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.replace_order_service_allocations(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_order_service_allocations(uuid, uuid, uuid[]) TO authenticated;
