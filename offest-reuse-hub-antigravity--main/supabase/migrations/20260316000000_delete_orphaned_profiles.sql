-- Delete profiles whose auth.users entry no longer exists (orphaned from deleted accounts)
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM auth.users);

-- Create a trigger function that deletes the profile when an auth user is deleted
CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

-- Attach the trigger to auth.users (runs after each row delete)
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_deleted();

-- RPC function: return only profiles whose auth user still exists.
-- Uses SECURITY DEFINER so it can read auth.users safely from the client.
CREATE OR REPLACE FUNCTION public.get_active_profiles()
RETURNS TABLE (
  id           uuid,
  email        text,
  full_name    text,
  company      text,
  is_approved  boolean,
  is_rejected  boolean,
  created_at   timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.full_name, p.company, p.is_approved, p.is_rejected, p.created_at
  FROM public.profiles p
  INNER JOIN auth.users u ON p.id = u.id
  ORDER BY p.created_at DESC;
$$;

-- Only admins should be able to call this function
REVOKE ALL ON FUNCTION public.get_active_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_profiles() TO authenticated;
