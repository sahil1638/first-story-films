-- Fix S1: prevent self-service role escalation through public.profiles.
--
-- Do not use current_user for invoker authorization here. These trigger
-- functions run as SECURITY DEFINER, so current_user is the function owner
-- rather than the authenticated caller. Use auth.uid(), auth.role(), and the
-- trusted JWT app_metadata role claim instead.

CREATE OR REPLACE FUNCTION public.check_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role text := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
  jwt_role text := auth.role();
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF jwt_role = 'service_role' OR caller_role = 'admin' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Only administrators can change user roles.';
  END IF;

  IF caller_id = OLD.id OR caller_role = 'admin' OR jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unauthorized profile update.';
END;
$$;

DROP TRIGGER IF EXISTS before_profile_role_update ON public.profiles;
CREATE TRIGGER before_profile_role_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profile_role_update();

-- Keep profile role sync, but harden its search path.
CREATE OR REPLACE FUNCTION public.sync_profile_to_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role::text)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Replace broad profile update policy with explicit safe self-update and admin update policies.
DROP POLICY IF EXISTS "Profiles update self or admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update own safe fields" ON public.profiles;
DROP POLICY IF EXISTS "Profiles update admin only" ON public.profiles;

CREATE POLICY "Profiles update own safe fields" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles update admin only" ON public.profiles
  FOR UPDATE TO authenticated
  USING (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin')
  WITH CHECK (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');

-- Defense in depth: authenticated users may update safe profile columns directly,
-- but role changes must go through the service-role admin path or an admin JWT.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (email, full_name, updated_at) ON public.profiles TO authenticated;
REVOKE UPDATE (role) ON public.profiles FROM authenticated;
