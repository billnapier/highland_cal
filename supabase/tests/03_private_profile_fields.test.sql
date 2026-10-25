-- pgTAP: private profile fields are no longer publicly readable.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

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
CREATE FUNCTION tests.as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
END $$;
CREATE FUNCTION tests.mk_user(uid uuid, email text, r public.user_role) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (uid, email, json_build_object('full_name', email)::jsonb);
  UPDATE public.user_roles SET role = r WHERE user_id = uid;
  UPDATE public.profiles SET throwing_experience = 'some', attended_practice = true WHERE id = uid;
END $$;
CREATE FUNCTION tests.mk_token(uid uuid, raw text, scopes text[]) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES (uid, raw, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), left(raw, 12), scopes)
  RETURNING id
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

SELECT tests.mk_user('00000000-0000-0000-0000-00000000000a', 'admin@example.com', 'ADMIN');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000b', 'approved@example.com', 'APPROVED');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000c', 'pending@example.com', 'PENDING');
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000a', 'tok_admin_users', ARRAY['users:admin']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000a', 'tok_admin_events', ARRAY['events:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'tok_appr', ARRAY['attendance:write']);

-- Column privileges: private columns are not selectable by any client role.
SELECT ok(NOT has_column_privilege('anon', 'public.profiles', col, 'SELECT'), 'anon cannot select profiles.' || col)
  FROM unnest(ARRAY['email', 'throwing_experience', 'attended_practice']) col;
SELECT ok(NOT has_column_privilege('authenticated', 'public.profiles', col, 'SELECT'), 'authenticated cannot select profiles.' || col)
  FROM unnest(ARRAY['email', 'throwing_experience', 'attended_practice']) col;
SELECT ok(has_column_privilege('anon', 'public.profiles', col, 'SELECT'), 'public column still readable: ' || col)
  FROM unnest(ARRAY['id', 'display_name', 'class', 'outward_links', 'avatar_url', 'vanity_name', 'created_at']) col;

SELECT tests.as_anon();
SELECT throws_ok($$ SELECT email FROM public.profiles $$, '42501', NULL, 'anonymous: SELECT email fails');
SELECT throws_ok($$ SELECT * FROM public.profiles $$, '42501', NULL, 'anonymous: SELECT * fails (no table-level grant)');
SELECT is((SELECT count(*)::int FROM public.profiles), 3, 'anonymous: public roster still readable');

SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT throws_ok($$ SELECT email FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000000b' $$, '42501', NULL,
  'session: even your own email is not selectable directly');
SELECT lives_ok($$ UPDATE public.profiles SET class = 'A' WHERE id = '00000000-0000-0000-0000-00000000000b' $$,
  'session: can still update own profile');
SELECT lives_ok($$ UPDATE public.profiles SET throwing_experience = 'lots', attended_practice = false WHERE id = '00000000-0000-0000-0000-00000000000b' $$,
  'session: can still submit the application form');

-- get_user_private(): self, or admin with users:admin
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT results_eq(
  $$ SELECT id, email FROM public.get_user_private(ARRAY['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[]) $$,
  $$ VALUES ('00000000-0000-0000-0000-00000000000b'::uuid, 'approved@example.com'::text) $$,
  'non-admin session: only own private fields');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT is((SELECT count(*)::int FROM public.get_user_private(ARRAY['00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[])), 2,
  'admin session: everyone''s private fields');
SELECT tests.as_token('tok_admin_users');
SELECT is((SELECT count(*)::int FROM public.get_user_private(ARRAY['00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[])), 2,
  'admin token with users:admin: everyone''s private fields');
SELECT tests.as_token('tok_admin_events');
SELECT results_eq(
  $$ SELECT id FROM public.get_user_private(ARRAY['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b']::uuid[]) $$,
  $$ VALUES ('00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'admin token WITHOUT users:admin: only its own private fields');
SELECT tests.as_token('tok_appr');
SELECT is((SELECT count(*)::int FROM public.get_user_private(ARRAY['00000000-0000-0000-0000-00000000000a']::uuid[])), 0,
  'non-admin token: no one else''s private fields');
SELECT tests.as_anon();
SELECT is((SELECT count(*)::int FROM public.get_user_private(ARRAY['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b']::uuid[])), 0,
  'anonymous: no private fields');

SELECT * FROM finish();
ROLLBACK;
