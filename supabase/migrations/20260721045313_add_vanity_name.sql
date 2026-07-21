-- Add vanity_name to Profiles
ALTER TABLE public.Profiles ADD COLUMN vanity_name text;

-- Create unique index on vanity_name
CREATE UNIQUE INDEX IF NOT EXISTS profiles_vanity_name_idx ON public.Profiles (vanity_name);

-- Add CHECK constraint on vanity_name format and to prevent pure UUIDs
ALTER TABLE public.Profiles 
  ADD CONSTRAINT vanity_name_format 
  CHECK (
    vanity_name IS NULL OR (
      vanity_name ~ '^[a-z0-9-]+$' AND
      vanity_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

-- Function to validate vanity name update permissions based on User_Roles
CREATE OR REPLACE FUNCTION public.check_vanity_name()
RETURNS trigger AS $$
DECLARE
  user_role_val text;
BEGIN
  -- If vanity_name is being changed/set/cleared
  IF (TG_OP = 'INSERT' AND NEW.vanity_name IS NOT NULL) OR 
     (TG_OP = 'UPDATE' AND NEW.vanity_name IS DISTINCT FROM OLD.vanity_name) THEN
    
    -- Check user role
    SELECT role INTO user_role_val FROM public.User_Roles WHERE user_id = NEW.id;
    
    IF user_role_val IS NULL OR user_role_val = 'PENDING' THEN
      RAISE EXCEPTION 'Only APPROVED or ADMIN users can set, update, or clear a vanity name';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on Profiles table
CREATE TRIGGER enforce_vanity_name_permissions
  BEFORE INSERT OR UPDATE ON public.Profiles
  FOR EACH ROW EXECUTE PROCEDURE public.check_vanity_name();
