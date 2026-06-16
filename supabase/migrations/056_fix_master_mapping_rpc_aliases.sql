-- Migration: 056_fix_master_mapping_rpc_aliases.sql
-- Resolves ambiguous service_id references in master mapping replacement RPCs.

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
