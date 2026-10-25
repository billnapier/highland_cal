-- =============================================================================
-- Milestone 14 (part 1): Agent API database foundation
--
-- Makes Row Level Security the single source of authorization for both the web
-- UI (Supabase session JWTs) and the Agent API (Personal Access Tokens).
-- A PAT is forwarded by the API in the `x-hcal-token` request header using the
-- anon key; PostgREST exposes request headers to SQL, so the policies below can
-- authenticate tokens themselves. For browser sessions every predicate reduces
-- to the previous behavior. See docs/Detailed_Design.md §3.5–3.6.
--
-- Never edit earlier migrations; this file only adds and replaces objects.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

CREATE TABLE public.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  prefix text NOT NULL CHECK (char_length(prefix) BETWEEN 4 AND 16),
  scopes text[] NOT NULL DEFAULT '{}'::text[]
    CHECK (scopes <@ ARRAY['attendance:write', 'events:write', 'events:delete', 'users:admin']::text[]),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX api_tokens_user_id_idx ON public.api_tokens (user_id);

CREATE TABLE public.api_rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE TABLE public.api_idempotency_keys (
  token_id uuid NOT NULL REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 255),
  request_hash text NOT NULL,
  status integer,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_id, key)
);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Identity functions
-- -----------------------------------------------------------------------------

-- The valid token row for the `x-hcal-token` header, or NULL.
-- A browser session always wins: when auth.uid() is set, any token is ignored.
CREATE OR REPLACE FUNCTION public.request_token()
RETURNS public.api_tokens
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  raw text;
  t public.api_tokens;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN NULL;
  END IF;
  raw := nullif(current_setting('request.headers', true), '')::json ->> 'x-hcal-token';
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO t
  FROM public.api_tokens
  WHERE token_hash = encode(sha256(convert_to(raw, 'UTF8')), 'hex')
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());
  RETURN t;  -- NULL row when not found
END;
$$;

-- Narrow, client-safe accessors. request_token() returns the full row
-- (including token_hash), so it is internal; policies and invoker functions
-- use these instead.
CREATE OR REPLACE FUNCTION public.current_token_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (public.request_token()).id
$$;

-- The user this request acts as: the session user, else the token's owner.
CREATE OR REPLACE FUNCTION public.current_actor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(auth.uid(), (public.request_token()).user_id)
$$;

-- True for a logged-in browser session (never for a PAT).
CREATE OR REPLACE FUNCTION public.is_session()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
$$;

-- Sessions have every scope their role allows; PATs only the scopes granted.
-- Single extension point for Milestone 15 (OAuth scope claims).
CREATE OR REPLACE FUNCTION public.has_scope(s text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL THEN true
    ELSE coalesce(s = ANY ((public.request_token()).scopes), false)
  END
$$;

-- Role checks now follow the acting user (session or token owner). The role is
-- read live on every request, so demotions take effect immediately for tokens.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT role = 'ADMIN'::public.user_role
       FROM public.user_roles WHERE user_id = public.current_actor_id()),
    false)
$$;

CREATE OR REPLACE FUNCTION public.is_approved_or_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT role IN ('APPROVED'::public.user_role, 'ADMIN'::public.user_role)
       FROM public.user_roles WHERE user_id = public.current_actor_id()),
    false)
$$;

-- -----------------------------------------------------------------------------
-- 3. Token-aware policies (drop + recreate; public SELECT policies unchanged)
--    Calls are wrapped as (select fn()) so they run once per statement.
-- -----------------------------------------------------------------------------

-- Games
DROP POLICY "Approved users or admins can insert games" ON public.games;
DROP POLICY "Approved users or admins can update games" ON public.games;
DROP POLICY "Only admins can delete games" ON public.games;

CREATE POLICY "Approved users or admins can insert games" ON public.games
  FOR INSERT WITH CHECK (
    (SELECT public.is_approved_or_admin())
    AND (SELECT public.has_scope('events:write'))
    AND created_by = (SELECT public.current_actor_id())
  );

CREATE POLICY "Approved users or admins can update games" ON public.games
  FOR UPDATE USING (
    (SELECT public.has_scope('events:write'))
    AND (
      (SELECT public.is_admin())
      OR ((SELECT public.is_approved_or_admin()) AND created_by = (SELECT public.current_actor_id()))
    )
  );

CREATE POLICY "Only admins can delete games" ON public.games
  FOR DELETE USING (
    (SELECT public.is_admin()) AND (SELECT public.has_scope('events:delete'))
  );

-- Attendance
DROP POLICY "Users can manage their own attendance if approved" ON public.attendance;
DROP POLICY "Users can update their own attendance if approved" ON public.attendance;
DROP POLICY "Users can delete their own attendance if approved" ON public.attendance;

CREATE POLICY "Users can manage their own attendance if approved" ON public.attendance
  FOR INSERT WITH CHECK (
    user_id = (SELECT public.current_actor_id())
    AND (SELECT public.is_approved_or_admin())
    AND (SELECT public.has_scope('attendance:write'))
  );

CREATE POLICY "Users can update their own attendance if approved" ON public.attendance
  FOR UPDATE USING (
    user_id = (SELECT public.current_actor_id())
    AND (SELECT public.is_approved_or_admin())
    AND (SELECT public.has_scope('attendance:write'))
  );

CREATE POLICY "Users can delete their own attendance if approved" ON public.attendance
  FOR DELETE USING (
    user_id = (SELECT public.current_actor_id())
    AND (SELECT public.is_approved_or_admin())
    AND (SELECT public.has_scope('attendance:write'))
  );

-- User_Roles
DROP POLICY "Only admins can update roles" ON public.user_roles;
CREATE POLICY "Only admins can update roles" ON public.user_roles
  FOR UPDATE USING (
    (SELECT public.is_admin()) AND (SELECT public.has_scope('users:admin'))
  );

-- Settings: not exposed via the API, so tokens get no write access.
DROP POLICY "Only admins can manage settings" ON public.settings;
CREATE POLICY "Only admins can manage settings" ON public.settings
  USING ((SELECT public.is_admin()) AND (SELECT public.is_session()));

-- Storage (public_images): session only.
DROP POLICY "Authenticated users can upload images" ON storage.objects;
DROP POLICY "Users can update their own images or admins can update any" ON storage.objects;
DROP POLICY "Users can delete their own images or admins can delete any" ON storage.objects;

CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'public_images'
  AND auth.role() = 'authenticated'
  AND (SELECT public.is_session())
  AND (SELECT public.is_approved_or_admin())
);

CREATE POLICY "Users can update their own images or admins can update any"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'public_images'
  AND auth.role() = 'authenticated'
  AND (SELECT public.is_session())
  AND (owner = auth.uid() OR (SELECT public.is_admin()))
);

CREATE POLICY "Users can delete their own images or admins can delete any"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'public_images'
  AND auth.role() = 'authenticated'
  AND (SELECT public.is_session())
  AND (owner = auth.uid() OR (SELECT public.is_admin()))
);

-- -----------------------------------------------------------------------------
-- 4. Api_Tokens: grants, policies, scope guard
-- -----------------------------------------------------------------------------

-- Supabase default privileges grant ALL to anon/authenticated; start from zero.
REVOKE ALL ON public.api_tokens FROM anon, authenticated;
-- Token requests arrive as `anon` (anon key + header), sessions as `authenticated`.
-- token_hash is never selectable.
GRANT SELECT (id, user_id, name, prefix, scopes, created_at, expires_at, last_used_at, revoked_at)
  ON public.api_tokens TO anon, authenticated;
-- Creation is session-only (a leaked token cannot mint more). No UPDATE/DELETE grant:
-- revocation goes only through revoke_api_token(), so it cannot be undone.
GRANT INSERT (user_id, name, token_hash, prefix, scopes, expires_at)
  ON public.api_tokens TO authenticated;

CREATE POLICY "Owners can view their tokens" ON public.api_tokens
  FOR SELECT USING (user_id = (SELECT public.current_actor_id()));

CREATE POLICY "Users can create their own tokens from a session" ON public.api_tokens
  FOR INSERT WITH CHECK (
    (SELECT public.is_session()) AND user_id = (SELECT auth.uid())
  );

-- Admin-only scopes may only be granted to Admins' tokens. (They would be inert
-- anyway, since the policies also require is_admin(); this keeps data honest.)
CREATE OR REPLACE FUNCTION public.check_api_token_scopes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.scopes && ARRAY['events:delete', 'users:admin']::text[]
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = NEW.user_id AND role = 'ADMIN'::public.user_role
     ) THEN
    RAISE EXCEPTION 'Only admins can create tokens with admin scopes'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_api_token_scopes
  BEFORE INSERT ON public.api_tokens
  FOR EACH ROW EXECUTE PROCEDURE public.check_api_token_scopes();

-- Irreversible revocation by the token's owner (from a session or any live
-- token of the same owner). Returns true if a token was revoked.
CREATE OR REPLACE FUNCTION public.revoke_api_token(token_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor uuid := public.current_actor_id();
  n integer;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401';
  END IF;
  UPDATE public.api_tokens
     SET revoked_at = now()
   WHERE id = token_id AND user_id = actor AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Rate limiting & per-request authentication
-- -----------------------------------------------------------------------------

REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;  -- no policies, no grants

-- Fixed one-minute window counter. Internal: not executable by clients.
CREATE OR REPLACE FUNCTION public.api_rate_limit_hit(p_bucket text, p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  w timestamptz := date_trunc('minute', now());
  c integer;
BEGIN
  INSERT INTO public.api_rate_limits AS r (bucket, window_start, count)
  VALUES (p_bucket, w, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO c;

  -- Opportunistic pruning keeps the table tiny without a cron job.
  IF random() < 0.02 THEN
    DELETE FROM public.api_rate_limits WHERE window_start < now() - interval '5 minutes';
  END IF;

  IF c > p_limit THEN
    RAISE EXCEPTION 'Rate limit exceeded'
      USING ERRCODE = 'PT429',
            DETAIL = json_build_object(
              'limit', p_limit,
              'retry_after', ceil(extract(epoch FROM (w + interval '1 minute') - now()))::int
            )::text;
  END IF;

  RETURN jsonb_build_object(
    'limit', p_limit,
    'remaining', greatest(p_limit - c, 0),
    'reset', extract(epoch FROM w + interval '1 minute')::bigint
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.api_rate_limit_hit(text, integer) FROM PUBLIC, anon, authenticated;

-- Called once at the start of every authenticated API request. Validates the
-- header token (PT401 -> HTTP 401), applies the per-token rate limit
-- (PT429 -> 429), records last use, and returns identity info for /me and for
-- friendly error messages. NOT used for authorization: RLS does that.
CREATE OR REPLACE FUNCTION public.api_authenticate(kind text DEFAULT 'read')
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.api_tokens := public.request_token();
  r public.user_role;
  rl jsonb;
BEGIN
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or revoked token' USING ERRCODE = 'PT401';
  END IF;
  IF kind NOT IN ('read', 'write') THEN
    RAISE EXCEPTION 'kind must be read or write' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  rl := public.api_rate_limit_hit(
    'token:' || t.id || ':' || kind,
    CASE WHEN kind = 'write' THEN 60 ELSE 300 END
  );

  IF t.last_used_at IS NULL OR t.last_used_at < now() - interval '1 minute' THEN
    UPDATE public.api_tokens SET last_used_at = now() WHERE id = t.id;
  END IF;

  IF random() < 0.02 THEN
    DELETE FROM public.api_idempotency_keys
     WHERE token_id = t.id AND created_at < now() - interval '24 hours';
  END IF;

  SELECT role INTO r FROM public.user_roles WHERE user_id = t.user_id;

  RETURN jsonb_build_object(
    'user_id', t.user_id,
    'role', r,
    'scopes', to_jsonb(t.scopes),
    'token_id', t.id,
    'rate_limit', rl
  );
END;
$$;

-- Rate limit for unauthenticated API reads, keyed by a hash of the client IP
-- computed by the API route (raw IPs are never stored).
CREATE OR REPLACE FUNCTION public.api_rate_limit_anonymous(ip_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF ip_hash IS NULL OR ip_hash !~ '^[0-9a-f]{16,64}$' THEN
    RAISE EXCEPTION 'ip_hash must be a hex digest' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN public.api_rate_limit_hit('ip:' || ip_hash || ':read', 120);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Idempotent event creation (atomic; runs under the caller's RLS)
-- -----------------------------------------------------------------------------

REVOKE ALL ON public.api_idempotency_keys FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.api_idempotency_keys TO anon;

CREATE POLICY "Tokens can read their own idempotency keys" ON public.api_idempotency_keys
  FOR SELECT USING (token_id = (SELECT public.current_token_id()));
CREATE POLICY "Tokens can claim their own idempotency keys" ON public.api_idempotency_keys
  FOR INSERT WITH CHECK (token_id = (SELECT public.current_token_id()));
CREATE POLICY "Tokens can update their own idempotency keys" ON public.api_idempotency_keys
  FOR UPDATE USING (token_id = (SELECT public.current_token_id()));

-- SECURITY INVOKER: the Games insert is checked by the caller's RLS. The whole
-- function is one transaction, so the key claim, the insert, and the stored
-- result commit (or roll back) together. A concurrent retry with the same key
-- blocks on the primary key until the first attempt finishes.
CREATE OR REPLACE FUNCTION public.api_create_event(payload jsonb, idem_key text, request_hash text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  tok uuid := public.current_token_id();
  claimed boolean;
  k public.api_idempotency_keys;
  g public.games;
  result jsonb;
BEGIN
  IF tok IS NULL THEN
    RAISE EXCEPTION 'A personal access token is required' USING ERRCODE = 'PT401';
  END IF;

  -- Claim the key. A stale (>24h) key is reclaimed in place.
  INSERT INTO public.api_idempotency_keys AS i (token_id, key, request_hash)
  VALUES (tok, idem_key, api_create_event.request_hash)
  ON CONFLICT (token_id, key) DO UPDATE
    SET request_hash = excluded.request_hash, status = NULL, response = NULL, created_at = now()
    WHERE i.created_at < now() - interval '24 hours'
  RETURNING true INTO claimed;

  IF claimed IS NULL THEN
    SELECT * INTO k FROM public.api_idempotency_keys WHERE token_id = tok AND key = idem_key;
    IF k.request_hash <> api_create_event.request_hash THEN
      RAISE EXCEPTION 'Idempotency-Key reused with a different request'
        USING ERRCODE = 'PT409', HINT = 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object('status', k.status, 'response', k.response, 'replayed', true);
  END IF;

  INSERT INTO public.games (name, start_date, is_two_day, type, start_time, end_time,
                            location, registration_url, created_by)
  VALUES (
    payload ->> 'name',
    (payload ->> 'start_date')::date,
    coalesce((payload ->> 'is_two_day')::boolean, false),
    coalesce(payload ->> 'type', 'EVENT'),
    (payload ->> 'start_time')::time,
    (payload ->> 'end_time')::time,
    payload ->> 'location',
    payload ->> 'registration_url',
    public.current_actor_id()
  )
  RETURNING * INTO g;

  result := to_jsonb(g);
  UPDATE public.api_idempotency_keys
     SET status = 201, response = result
   WHERE token_id = tok AND key = idem_key;

  RETURN jsonb_build_object('status', 201, 'response', result, 'replayed', false);
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. User deletion authorization (the API/UI then calls auth.admin.deleteUser)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.authorize_user_deletion(target uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.current_actor_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401';
  END IF;
  IF NOT (public.is_admin() AND public.has_scope('users:admin')) THEN
    RAISE EXCEPTION 'Only admins can delete users' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF target = public.current_actor_id() THEN
    RAISE EXCEPTION 'You cannot delete your own account' USING ERRCODE = 'PT409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'PT404';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Private profile fields (closes a pre-existing exposure)
--    Privileges are additive, so revoking one column is not enough while a
--    table-level grant exists: revoke the table, re-grant public columns only.
-- -----------------------------------------------------------------------------

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, display_name, class, outward_links, avatar_url, vanity_name, created_at)
  ON public.profiles TO anon, authenticated;

-- Private fields for yourself, or for anyone if you're an Admin with users:admin.
CREATE OR REPLACE FUNCTION public.get_user_private(ids uuid[])
RETURNS TABLE (id uuid, email text, throwing_experience text, attended_practice boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.email, p.throwing_experience, p.attended_practice
  FROM public.profiles p
  WHERE p.id = ANY (ids)
    AND (
      p.id = public.current_actor_id()
      OR (public.is_admin() AND public.has_scope('users:admin'))
    )
$$;

-- -----------------------------------------------------------------------------
-- 9. Privileges
--    Don't rely on Supabase's default privileges: newer projects
--    (api.auto_expose_new_tables = false) don't grant them. Be explicit, and
--    let RLS decide row access. Postgres also grants EXECUTE to PUBLIC by
--    default, so internal functions are revoked explicitly.
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.games, public.attendance TO anon, authenticated;
GRANT SELECT, UPDATE ON public.user_roles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
-- Profiles: public columns only for SELECT (granted above); updates are
-- governed by the "own profile" policy and the vanity-name trigger.
GRANT UPDATE ON public.profiles TO authenticated;

-- request_token() returns token_hash: never client-callable.
REVOKE EXECUTE ON FUNCTION public.request_token() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.current_token_id(), public.current_actor_id(), public.is_session(), public.has_scope(text),
  public.is_admin(), public.is_approved_or_admin(),
  public.revoke_api_token(uuid), public.api_authenticate(text), public.api_rate_limit_anonymous(text),
  public.api_create_event(jsonb, text, text), public.authorize_user_deletion(uuid),
  public.get_user_private(uuid[])
TO anon, authenticated;
