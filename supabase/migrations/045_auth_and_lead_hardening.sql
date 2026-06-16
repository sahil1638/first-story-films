-- Migration: 045_auth_and_lead_hardening.sql
-- Hardens database RPC execute access, removes role meta parsing from handle_new_user, and adds role reconciliation.

-- 1. Restrict create_public_lead_rpc to service_role only
REVOKE EXECUTE ON FUNCTION public.create_public_lead_rpc(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_lead_rpc(jsonb) TO service_role;

-- 2. Restrict check_rate_limit to service_role only (since rate limits are evaluated server-side)
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, numeric, numeric, numeric) TO service_role;

-- 3. Harden handle_new_user to always default to 'sales' and ignore role metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Always default new users to 'sales' role. Admins will update profiles.role explicitly if needed.
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    'sales'::public.user_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user error: %', SQLERRM;
    RAISE;
END;
$$;

-- 4. Create database role reconciliation helper
CREATE OR REPLACE FUNCTION public.reconcile_user_roles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Reconcile auth.users raw_app_meta_data->>'role' to match public.profiles.role (which is authoritative)
  WITH mismatch AS (
    SELECT p.id, p.role
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE (u.raw_app_meta_data->>'role' IS DISTINCT FROM p.role::text)
  ),
  updated AS (
    UPDATE auth.users u
    SET raw_app_meta_data = jsonb_set(COALESCE(u.raw_app_meta_data, '{}'::jsonb), '{role}', to_jsonb(m.role::text))
    FROM mismatch m
    WHERE u.id = m.id
    RETURNING u.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

-- Revoke execute on reconcile_user_roles from PUBLIC and grant only to service_role
REVOKE ALL ON FUNCTION public.reconcile_user_roles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_user_roles() TO service_role;
