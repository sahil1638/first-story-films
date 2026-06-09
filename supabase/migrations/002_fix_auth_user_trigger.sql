-- Fix: "Database error creating new user"
-- Run this in Supabase SQL Editor if user creation fails.

-- Safer profile creation (invalid/missing role no longer breaks signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_role public.user_role := 'sales';
  meta_role text;
BEGIN
  meta_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));

  IF meta_role IN ('admin', 'manager', 'sales') THEN
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

-- Ensure trigger exists (drop first if you re-run)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Permissions for Supabase Auth
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.profiles TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
