-- pgTAP: token identity, token lifecycle, and API-support functions.
-- Run with `supabase test db`. Every file is self-contained and rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- ---------------------------------------------------------------- helpers ---
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated;

CREATE FUNCTION tests.as_session(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.headers', '{}', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION tests.as_token(raw text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', json_build_object('x-hcal-token', raw)::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
END $$;
CREATE FUNCTION tests.as_session_with_token(uid uuid, raw text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM tests.as_session(uid);
  PERFORM set_config('request.headers', json_build_object('x-hcal-token', raw)::text, true);
END $$;
CREATE FUNCTION tests.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
END $$;
CREATE FUNCTION tests.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', '{}', true);
END $$;
CREATE FUNCTION tests.mk_user(uid uuid, email text, r public.user_role) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (uid, email, json_build_object('full_name', email)::jsonb);
  UPDATE public.user_roles SET role = r WHERE user_id = uid;
END $$;
CREATE FUNCTION tests.mk_token(uid uuid, raw text, scopes text[],
                               expires timestamptz DEFAULT NULL, revoked timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes, expires_at, revoked_at)
  VALUES (uid, raw, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), left(raw, 12), scopes, expires, revoked)
  RETURNING id
$$;
-- Look up a token id by name, bypassing RLS (runs as the test owner), so
-- assertions can target tokens the current caller is not allowed to see.
CREATE FUNCTION tests.token_id(token_name text) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT id FROM public.api_tokens WHERE name = token_name
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- --------------------------------------------------------------- fixtures ---
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000a', 'admin@example.com', 'ADMIN');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000b', 'approved@example.com', 'APPROVED');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000c', 'pending@example.com', 'PENDING');

SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'hcal_pat_approved_rsvp', ARRAY['attendance:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'hcal_pat_approved_other', ARRAY['events:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'hcal_pat_approved_revoked', ARRAY['attendance:write'], NULL, now());
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'hcal_pat_approved_expired', ARRAY['attendance:write'], now() - interval '1 second');
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000a', 'hcal_pat_admin_all',
  ARRAY['attendance:write', 'events:write', 'events:delete', 'users:admin']);

-- ------------------------------------------------------------- identity -----
SELECT tests.as_anon();
SELECT is(public.current_actor_id(), NULL, 'anonymous: no actor');
SELECT is(public.has_scope('events:write'), false, 'anonymous: no scopes');
SELECT is(public.is_session(), false, 'anonymous: not a session');

SELECT tests.as_token('hcal_pat_approved_rsvp');
SELECT is(public.current_actor_id(), '00000000-0000-0000-0000-00000000000b'::uuid, 'token: acts as its owner');
SELECT is(public.has_scope('attendance:write'), true, 'token: has granted scope');
SELECT is(public.has_scope('events:write'), false, 'token: lacks ungranted scope');
SELECT is(public.is_session(), false, 'token: is not a session');
SELECT is(public.is_approved_or_admin(), true, 'token: role follows owner');
SELECT is(public.is_admin(), false, 'token: non-admin owner is not admin');

SELECT tests.as_token('hcal_pat_approved_revoked');
SELECT is(public.current_actor_id(), NULL, 'revoked token: no actor');
SELECT tests.as_token('hcal_pat_approved_expired');
SELECT is(public.current_actor_id(), NULL, 'expired token: no actor');
SELECT tests.as_token('hcal_pat_does_not_exist');
SELECT is(public.current_actor_id(), NULL, 'unknown token: no actor');
SELECT tests.as_token('');
SELECT is(public.current_actor_id(), NULL, 'empty token header: no actor');

SELECT tests.as_session('00000000-0000-0000-0000-00000000000c');
SELECT is(public.current_actor_id(), '00000000-0000-0000-0000-00000000000c'::uuid, 'session: acts as session user');
SELECT is(public.has_scope('users:admin'), true, 'session: has_scope is always true (role still applies)');
SELECT is(public.is_session(), true, 'session: is a session');

SELECT tests.as_session_with_token('00000000-0000-0000-0000-00000000000c', 'hcal_pat_admin_all');
SELECT is(public.current_actor_id(), '00000000-0000-0000-0000-00000000000c'::uuid, 'session + token: session wins, token ignored');
SELECT is(public.is_admin(), false, 'session + admin token: no admin escalation');

-- ----------------------------------------------------- token visibility -----
SELECT tests.as_token('hcal_pat_approved_rsvp');
SELECT throws_ok($$ SELECT token_hash FROM public.api_tokens $$, '42501', NULL, 'token: token_hash is not selectable');
SELECT is((SELECT count(*)::int FROM public.api_tokens), 4, 'token: sees only its owner''s tokens');
SELECT throws_ok($$ SELECT (public.request_token()).token_hash $$, '42501', NULL,
  'token: request_token() (full row incl. token_hash) is not callable via RPC');
SELECT is(public.current_token_id(), tests.token_id('hcal_pat_approved_rsvp'), 'token: current_token_id() returns only the id');
SELECT ok(NOT (to_jsonb(public.api_authenticate('read')) ? 'token_hash'), 'api_authenticate() does not expose token_hash');

SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT throws_ok($$ SELECT token_hash FROM public.api_tokens $$, '42501', NULL, 'session: token_hash is not selectable');
SELECT is((SELECT count(*)::int FROM public.api_tokens), 1, 'session: sees only own tokens');

SELECT tests.as_anon();
SELECT is((SELECT count(*)::int FROM public.api_tokens), 0, 'anonymous: sees no tokens');

-- ------------------------------------------------------- token creation -----
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT lives_ok($$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'new', repeat('a', 64), 'hcal_pat_new', ARRAY['events:write'])
$$, 'session: can create own token');
SELECT throws_ok($$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES ('00000000-0000-0000-0000-00000000000a', 'evil', repeat('b', 64), 'hcal_pat_evl', ARRAY[]::text[])
$$, '42501', NULL, 'session: cannot create a token for another user');
SELECT throws_ok($$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'adm', repeat('c', 64), 'hcal_pat_adm', ARRAY['users:admin'])
$$, '23514', NULL, 'non-admin: cannot create a token with admin scopes');
SELECT throws_ok($$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'bad', repeat('d', 64), 'hcal_pat_bad', ARRAY['root'])
$$, '23514', NULL, 'unknown scopes are rejected');

SELECT tests.as_token('hcal_pat_approved_rsvp');
SELECT throws_ok($$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES ('00000000-0000-0000-0000-00000000000b', 'mint', repeat('e', 64), 'hcal_pat_mnt', ARRAY[]::text[])
$$, '42501', NULL, 'token: cannot mint new tokens');

-- ----------------------------------------------------- token revocation -----
SELECT tests.as_token('hcal_pat_approved_rsvp');
SELECT throws_ok($$ UPDATE public.api_tokens SET revoked_at = NULL $$, '42501', NULL,
  'token: cannot UPDATE tokens directly (revocation cannot be undone)');
SELECT isnt(tests.token_id('hcal_pat_admin_all'), NULL, 'fixture: admin token id resolved (not a NULL no-op)');
SELECT is(public.revoke_api_token(tests.token_id('hcal_pat_admin_all')), false,
  'token: cannot revoke another user''s token');
SELECT tests.as_owner();
SELECT is((SELECT revoked_at FROM public.api_tokens WHERE name = 'hcal_pat_admin_all'), NULL,
  'the other user''s token is still live');
SELECT tests.as_token('hcal_pat_approved_rsvp');
SELECT is(public.revoke_api_token(tests.token_id('hcal_pat_approved_other')), true,
  'token: can revoke a sibling token of the same owner');
SELECT is(public.revoke_api_token(tests.token_id('hcal_pat_approved_other')), false,
  'revoking twice is a no-op');

SELECT tests.as_token('hcal_pat_approved_other');
SELECT is(public.current_actor_id(), NULL, 'revoked token stops working immediately');

SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT throws_ok($$ UPDATE public.api_tokens SET revoked_at = NULL $$, '42501', NULL,
  'session: cannot UPDATE tokens directly either');
SELECT tests.as_anon();
SELECT throws_ok($$ SELECT public.revoke_api_token(gen_random_uuid()) $$, 'PT401', NULL,
  'anonymous: revoke requires authentication');

-- ---------------------------------------------------- api_authenticate -----
SELECT tests.as_anon();
SELECT throws_ok($$ SELECT public.api_authenticate('read') $$, 'PT401', NULL, 'api_authenticate: no token -> PT401');
SELECT tests.as_token('hcal_pat_approved_revoked');
SELECT throws_ok($$ SELECT public.api_authenticate('read') $$, 'PT401', NULL, 'api_authenticate: revoked -> PT401');

SELECT tests.as_token('hcal_pat_approved_rsvp');
SELECT is(public.api_authenticate('read') ->> 'user_id', '00000000-0000-0000-0000-00000000000b', 'api_authenticate: returns owner');
SELECT is(public.api_authenticate('read') ->> 'role', 'APPROVED', 'api_authenticate: returns live role');
SELECT is(public.api_authenticate('read') -> 'scopes', '["attendance:write"]'::jsonb, 'api_authenticate: returns scopes');
SELECT throws_ok($$ SELECT public.api_authenticate('admin') $$, '22023', NULL, 'api_authenticate: rejects unknown kind');

SELECT tests.as_owner();
SELECT isnt((SELECT last_used_at FROM public.api_tokens WHERE name = 'hcal_pat_approved_rsvp'), NULL,
  'api_authenticate: records last_used_at');

-- 60 writes/minute per token, then PT429.
SELECT tests.as_token('hcal_pat_approved_rsvp');
SELECT lives_ok($$ SELECT public.api_authenticate('write') FROM generate_series(1, 60) $$, 'rate limit: 60 writes allowed');
SELECT throws_ok($$ SELECT public.api_authenticate('write') $$, 'PT429', NULL, 'rate limit: 61st write -> PT429');
SELECT lives_ok($$ SELECT public.api_authenticate('read') $$, 'rate limit: reads have a separate budget');

SELECT tests.as_anon();
SELECT is((public.api_rate_limit_anonymous(repeat('f', 32)) ->> 'remaining')::int, 119, 'anonymous rate limit: 120/min per IP hash');
SELECT throws_ok($$ SELECT public.api_rate_limit_anonymous('not-a-hash') $$, '22023', NULL, 'anonymous rate limit: requires a hex digest');
SELECT throws_ok($$ SELECT public.api_rate_limit_hit('x', 1) $$, '42501', NULL, 'api_rate_limit_hit is not client-callable');
SELECT throws_ok($$ SELECT count(*) FROM public.api_rate_limits $$, '42501', NULL, 'api_rate_limits is not client-readable');

SELECT * FROM finish();
ROLLBACK;
