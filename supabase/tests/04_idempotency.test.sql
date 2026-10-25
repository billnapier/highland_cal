-- pgTAP: atomic idempotent event creation (api_create_event).
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
CREATE FUNCTION tests.mk_token(uid uuid, raw text, scopes text[]) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES (uid, raw, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), left(raw, 12), scopes)
  RETURNING id
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

SELECT tests.mk_user('00000000-0000-0000-0000-00000000000b', 'approved@example.com', 'APPROVED');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000c', 'pending@example.com', 'PENDING');
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'tok_b1', ARRAY['events:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'tok_b2', ARRAY['events:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'tok_b_rsvp', ARRAY['attendance:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000c', 'tok_c', ARRAY['events:write']);

CREATE TABLE tests.r (label text PRIMARY KEY, v jsonb);
GRANT ALL ON tests.r TO anon, authenticated;

SELECT tests.as_token('tok_b1');
INSERT INTO tests.r SELECT 'first', public.api_create_event('{"name":"Pleasanton","start_date":"2027-09-04","is_two_day":true}', 'k1', 'h1');
SELECT is((SELECT (v ->> 'status')::int FROM tests.r WHERE label = 'first'), 201, 'first call creates (201)');
SELECT is((SELECT (v ->> 'replayed')::boolean FROM tests.r WHERE label = 'first'), false, 'first call is not a replay');
SELECT is((SELECT v -> 'response' ->> 'created_by' FROM tests.r WHERE label = 'first'), '00000000-0000-0000-0000-00000000000b',
  'created_by is the token owner');

INSERT INTO tests.r SELECT 'replay', public.api_create_event('{"name":"Pleasanton","start_date":"2027-09-04","is_two_day":true}', 'k1', 'h1');
SELECT is((SELECT (v ->> 'replayed')::boolean FROM tests.r WHERE label = 'replay'), true, 'same key + same hash replays');
SELECT is((SELECT v -> 'response' ->> 'id' FROM tests.r WHERE label = 'replay'),
          (SELECT v -> 'response' ->> 'id' FROM tests.r WHERE label = 'first'), 'replay returns the original event');
SELECT is((SELECT count(*)::int FROM public.games WHERE name = 'Pleasanton'), 1, 'replay does not create a duplicate');

SELECT throws_ok($$ SELECT public.api_create_event('{"name":"Other","start_date":"2027-09-04"}', 'k1', 'h2') $$,
  'PT409', NULL, 'same key + different hash -> PT409 idempotency_conflict');

SELECT tests.as_token('tok_b2');
SELECT is((public.api_create_event('{"name":"Pleasanton","start_date":"2027-09-04"}', 'k1', 'h1') ->> 'replayed')::boolean, false,
  'keys are scoped per token');

SELECT tests.as_token('tok_b_rsvp');
SELECT throws_ok($$ SELECT public.api_create_event('{"name":"X","start_date":"2027-09-04"}', 'k9', 'h9') $$,
  '42501', NULL, 'RLS still applies: token without events:write denied');
SELECT tests.as_owner();
SELECT is((SELECT count(*)::int FROM public.api_idempotency_keys WHERE key = 'k9'), 0,
  'a denied create rolls back its key claim');

SELECT tests.as_token('tok_c');
SELECT throws_ok($$ SELECT public.api_create_event('{"name":"X","start_date":"2027-09-04"}', 'k8', 'h8') $$,
  '42501', NULL, 'RLS still applies: PENDING owner denied');

SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT throws_ok($$ SELECT public.api_create_event('{"name":"X","start_date":"2027-09-04"}', 'k7', 'h7') $$,
  'PT401', NULL, 'requires a personal access token');

-- Isolation: one token cannot see another token's keys.
SELECT tests.as_token('tok_b2');
SELECT is((SELECT count(*)::int FROM public.api_idempotency_keys), 1, 'a token sees only its own idempotency keys');

-- Stale keys (>24h) are reclaimed rather than replayed.
SELECT tests.as_owner();
UPDATE public.api_idempotency_keys SET created_at = now() - interval '25 hours'
 WHERE key = 'k1' AND token_id = (SELECT id FROM public.api_tokens WHERE name = 'tok_b1');
SELECT tests.as_token('tok_b1');
SELECT is((public.api_create_event('{"name":"Again","start_date":"2027-09-05"}', 'k1', 'h-new') ->> 'replayed')::boolean, false,
  'a key older than 24h is reclaimed');

SELECT * FROM finish();
ROLLBACK;
