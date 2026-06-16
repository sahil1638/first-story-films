-- Migration: 050_update_public_lead_rpc_test_tagging.sql
-- Updates create_public_lead_rpc to support test_run_id and created_by_test tagging.

CREATE OR REPLACE FUNCTION public.create_public_lead_rpc(p_input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_day jsonb;
  v_day_id uuid;
  v_service_id uuid;
  v_first_event_id uuid;
  v_second_event_id uuid;
  v_event_count int;
  v_service_count int;
  v_unique_event_ids uuid[] := '{}';
  v_unique_service_ids uuid[] := '{}';
  v_test_run_id uuid;
  v_created_by_test boolean;
BEGIN
  -- Extract tagging columns if they exist in p_input
  v_test_run_id := (p_input->>'test_run_id')::uuid;
  v_created_by_test := coalesce((p_input->>'created_by_test')::boolean, false);

  -- 1. Extract and validate unique event and service IDs from input JSON
  FOR v_day IN SELECT jsonb_array_elements(p_input->'function_days') LOOP
    v_first_event_id := (v_day->>'first_event_id')::uuid;
    IF v_first_event_id IS NOT NULL AND NOT (v_first_event_id = any(v_unique_event_ids)) THEN
      v_unique_event_ids := array_append(v_unique_event_ids, v_first_event_id);
    END IF;

    v_second_event_id := (v_day->>'second_event_id')::uuid;
    IF v_second_event_id IS NOT NULL AND NOT (v_second_event_id = any(v_unique_event_ids)) THEN
      v_unique_event_ids := array_append(v_unique_event_ids, v_second_event_id);
    END IF;

    IF v_day ? 'service_ids' THEN
      FOR v_service_id IN SELECT (jsonb_array_elements_text(v_day->'service_ids'))::uuid LOOP
        IF NOT (v_service_id = any(v_unique_service_ids)) THEN
          v_unique_service_ids := array_append(v_unique_service_ids, v_service_id);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Verify active events
  IF array_length(v_unique_event_ids, 1) > 0 THEN
    SELECT COUNT(*) INTO v_event_count
    FROM events
    WHERE id = any(v_unique_event_ids) AND status = 'active';

    IF v_event_count <> array_length(v_unique_event_ids, 1) THEN
      RAISE EXCEPTION 'One or more selected events are unavailable';
    END IF;
  END IF;

  -- Verify active services
  IF array_length(v_unique_service_ids, 1) > 0 THEN
    SELECT COUNT(*) INTO v_service_count
    FROM services
    WHERE id = any(v_unique_service_ids) AND status = 'active';

    IF v_service_count <> array_length(v_unique_service_ids, 1) THEN
      RAISE EXCEPTION 'One or more selected services are unavailable';
    END IF;
  END IF;

  -- 2. Insert into leads
  INSERT INTO leads (
    source,
    status,
    your_name,
    couple_name,
    referral_source,
    contact_number,
    email,
    event_location,
    wedding_date,
    wedding_venue,
    album_requirement,
    drone_requirement,
    shooting_side,
    pre_wedding_shoot,
    functions_count,
    has_additional_info,
    additional_details,
    agreement_accepted,
    budget_range,
    created_by,
    test_run_id,
    created_by_test
  ) VALUES (
    'public_form',
    'pending',
    p_input->>'your_name',
    p_input->>'couple_name',
    p_input->>'referral_source',
    p_input->>'contact_number',
    p_input->>'email',
    p_input->>'event_location',
    (p_input->>'wedding_date')::date,
    p_input->>'wedding_venue',
    p_input->>'album_requirement',
    p_input->>'drone_requirement',
    p_input->>'shooting_side',
    p_input->>'pre_wedding_shoot',
    (p_input->>'functions_count')::int,
    (p_input->>'has_additional_info')::boolean,
    p_input->>'additional_details',
    (p_input->>'agreement_accepted')::boolean,
    p_input->>'budget_range',
    NULL,
    v_test_run_id,
    v_created_by_test
  ) RETURNING id INTO v_lead_id;

  -- 3. Insert into lead_function_days & lead_function_day_services
  FOR v_day IN SELECT jsonb_array_elements(p_input->'function_days') LOOP
    INSERT INTO lead_function_days (
      lead_id,
      day_index,
      day_date,
      first_event_id,
      second_event_id,
      test_run_id,
      created_by_test
    ) VALUES (
      v_lead_id,
      (v_day->>'day_index')::int,
      (v_day->>'day_date')::date,
      (v_day->>'first_event_id')::uuid,
      (v_day->>'second_event_id')::uuid,
      v_test_run_id,
      v_created_by_test
    ) RETURNING id INTO v_day_id;

    IF v_day ? 'service_ids' THEN
      FOR v_service_id IN SELECT (jsonb_array_elements_text(v_day->'service_ids'))::uuid LOOP
        INSERT INTO lead_function_day_services (
          lead_function_day_id,
          service_id,
          test_run_id,
          created_by_test
        ) VALUES (
          v_day_id,
          v_service_id,
          v_test_run_id,
          v_created_by_test
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_lead_id;
END;
$$;

-- Enforce security_definer/service_role execute permissions (matching previous migrations)
REVOKE EXECUTE ON FUNCTION public.create_public_lead_rpc(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_lead_rpc(jsonb) TO service_role;
