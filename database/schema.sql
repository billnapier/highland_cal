-- Custom Types
CREATE TYPE public.user_role AS ENUM ('PENDING', 'APPROVED', 'ADMIN');
CREATE TYPE public.interest_level AS ENUM ('WATCHING', 'INTERESTED', 'REGISTERED', 'NOT_GOING');

-- Profiles Table
CREATE TABLE public.Profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  class text,
  outward_links jsonb,
  throwing_experience text,
  attended_practice boolean,
  created_at timestamptz DEFAULT now()
);

-- User_Roles Table
CREATE TABLE public.User_Roles (
  user_id uuid PRIMARY KEY REFERENCES public.Profiles(id) ON DELETE CASCADE,
  role public.user_role DEFAULT 'PENDING'::public.user_role
);

-- is_admin() Function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
  user_role_val public.user_role;
BEGIN
  SELECT role INTO user_role_val FROM public.User_Roles WHERE user_id = auth.uid();
  RETURN user_role_val = 'ADMIN'::public.user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- is_approved_or_admin() Function
CREATE OR REPLACE FUNCTION public.is_approved_or_admin()
RETURNS boolean AS $$
DECLARE
  user_role_val public.user_role;
BEGIN
  SELECT role INTO user_role_val FROM public.User_Roles WHERE user_id = auth.uid();
  RETURN user_role_val IN ('APPROVED'::public.user_role, 'ADMIN'::public.user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger: handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.Profiles (id, email, display_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  
  INSERT INTO public.User_Roles (user_id, role)
  VALUES (new.id, 'PENDING');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Games Table
CREATE TABLE public.Games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  is_two_day boolean NOT NULL DEFAULT false,
  type text NOT NULL DEFAULT 'EVENT' CHECK (type IN ('EVENT', 'PRACTICE')),
  start_time time,
  end_time time,
  location text,
  registration_url text,
  created_by uuid REFERENCES public.Profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Attendance Table
CREATE TABLE public.Attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.Profiles(id) ON DELETE CASCADE,
  game_id uuid REFERENCES public.Games(id) ON DELETE CASCADE,
  interest_level public.interest_level,
  attend_day text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, game_id)
);

-- Trigger for Attendance updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_attendance_updated_at
  BEFORE UPDATE ON public.Attendance
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.Profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.User_Roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.Games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.Attendance ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
CREATE POLICY "Public profiles are viewable by everyone" ON public.Profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.Profiles
  FOR UPDATE USING (auth.uid() = id);

-- User_Roles RLS
CREATE POLICY "User roles are viewable by everyone" ON public.User_Roles
  FOR SELECT USING (true);

CREATE POLICY "Only admins can update roles" ON public.User_Roles
  FOR UPDATE USING (public.is_admin());

-- Games RLS
CREATE POLICY "Games are viewable by everyone" ON public.Games
  FOR SELECT USING (true);

CREATE POLICY "Approved users or admins can insert games" ON public.Games
  FOR INSERT WITH CHECK (public.is_approved_or_admin() AND (auth.uid() = created_by));

CREATE POLICY "Approved users or admins can update games" ON public.Games
  FOR UPDATE USING (public.is_admin() OR (public.is_approved_or_admin() AND created_by = auth.uid()));

CREATE POLICY "Only admins can delete games" ON public.Games
  FOR DELETE USING (public.is_admin());

-- Attendance RLS
CREATE POLICY "Attendance is viewable by everyone" ON public.Attendance
  FOR SELECT USING (true);

CREATE POLICY "Users can manage their own attendance if approved" ON public.Attendance
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_approved_or_admin());

CREATE POLICY "Users can update their own attendance if approved" ON public.Attendance
  FOR UPDATE USING (auth.uid() = user_id AND public.is_approved_or_admin());

CREATE POLICY "Users can delete their own attendance if approved" ON public.Attendance
  FOR DELETE USING (auth.uid() = user_id AND public.is_approved_or_admin());
