-- 1. Hardened current_user_role() search path
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
DECLARE
  role_str text;
BEGIN
  role_str := auth.jwt() -> 'app_metadata' ->> 'role';
  IF role_str IS NULL OR role_str = '' THEN
    RETURN NULL;
  END IF;
  RETURN role_str::public.user_role;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Hardened handle_new_user() to prevent role self-escalation via signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_role public.user_role := 'sales';
  meta_role text;
BEGIN
  meta_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));

  -- Only allow service role (admin creation) to specify role in metadata
  IF current_user = 'service_role' AND meta_role IN ('admin', 'manager', 'sales') THEN
    selected_role := meta_role::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    selected_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = EXCLUDED.role;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user error: %', SQLERRM;
    RAISE;
END;
$$;

-- 3. BEFORE UPDATE trigger on public.profiles to block role self-escalation
CREATE OR REPLACE FUNCTION public.check_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND current_user = 'authenticated' AND COALESCE(public.current_user_role()::text, '') <> 'admin' THEN
    RAISE EXCEPTION 'Only administrators can change user roles.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_profile_role_update ON public.profiles;
CREATE TRIGGER before_profile_role_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profile_role_update();

-- 4. Secure RLS policies for order_deliverables (Restrict sales, allow admin/manager)
DROP POLICY IF EXISTS "Authenticated full access" ON public.order_deliverables;

CREATE POLICY "Select policy for authenticated roles" ON public.order_deliverables
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager', 'sales'));

CREATE POLICY "Insert policy for authenticated roles" ON public.order_deliverables
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'manager', 'sales'));

CREATE POLICY "Update and delete policy for admin and manager" ON public.order_deliverables
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.current_user_role() IN ('admin', 'manager'));
