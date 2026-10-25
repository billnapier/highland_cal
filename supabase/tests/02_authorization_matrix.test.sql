-- pgTAP: authorization matrix for every write the app or API can perform.
-- caller (anonymous / session / PAT) x role x scope x ownership x operation.
-- For sessions this proves the web UI's permissions are unchanged.
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
CREATE FUNCTION tests.mk_token(uid uuid, raw text, scopes text[]) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES (uid, raw, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), left(raw, 12), scopes)
  RETURNING id
$$;
-- Run a statement as the current caller and report how many rows it affected
-- (RLS filters UPDATE/DELETE silently, so "0 rows" is a denial).
CREATE FUNCTION tests.affected(stmt text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt; GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated;

-- --------------------------------------------------------------- fixtures ---
-- a = ADMIN, b = APPROVED, c = PENDING, d = APPROVED (another member)
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000a', 'admin@example.com', 'ADMIN');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000b', 'approved@example.com', 'APPROVED');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000c', 'pending@example.com', 'PENDING');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000d', 'other@example.com', 'APPROVED');

SELECT tests.mk_token('00000000-0000-0000-0000-00000000000a', 'tok_admin_all', ARRAY['attendance:write','events:write','events:delete','users:admin']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000a', 'tok_admin_none', ARRAY[]::text[]);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000a', 'tok_admin_events', ARRAY['events:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'tok_appr_events', ARRAY['events:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000b', 'tok_appr_rsvp', ARRAY['attendance:write']);
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000c', 'tok_pend_all', ARRAY['attendance:write','events:write']);

INSERT INTO public.games (id, name, start_date, created_by) VALUES
  ('10000000-0000-0000-0000-00000000000b', 'B''s game', '2027-06-01', '00000000-0000-0000-0000-00000000000b'),
  ('10000000-0000-0000-0000-00000000000d', 'D''s game', '2027-06-02', '00000000-0000-0000-0000-00000000000d'),
  ('10000000-0000-0000-0000-0000000000ff', 'To delete', '2027-06-03', '00000000-0000-0000-0000-00000000000d');

-- ================================================================ Games =====
-- Insert
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT lives_ok($$ INSERT INTO public.games (name, start_date, created_by) VALUES ('s', '2027-01-01', '00000000-0000-0000-0000-00000000000b') $$,
  'games insert: APPROVED session');
SELECT throws_ok($$ INSERT INTO public.games (name, start_date, created_by) VALUES ('s', '2027-01-01', '00000000-0000-0000-0000-00000000000d') $$,
  '42501', NULL, 'games insert: cannot set created_by to someone else');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000c');
SELECT throws_ok($$ INSERT INTO public.games (name, start_date, created_by) VALUES ('s', '2027-01-01', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', NULL, 'games insert: PENDING session denied');
SELECT tests.as_anon();
SELECT throws_ok($$ INSERT INTO public.games (name, start_date) VALUES ('s', '2027-01-01') $$,
  '42501', NULL, 'games insert: anonymous denied');

SELECT tests.as_token('tok_appr_events');
SELECT lives_ok($$ INSERT INTO public.games (name, start_date, created_by) VALUES ('t', '2027-01-01', '00000000-0000-0000-0000-00000000000b') $$,
  'games insert: APPROVED token with events:write');
SELECT tests.as_token('tok_appr_rsvp');
SELECT throws_ok($$ INSERT INTO public.games (name, start_date, created_by) VALUES ('t', '2027-01-01', '00000000-0000-0000-0000-00000000000b') $$,
  '42501', NULL, 'games insert: token without events:write denied');
SELECT tests.as_token('tok_pend_all');
SELECT throws_ok($$ INSERT INTO public.games (name, start_date, created_by) VALUES ('t', '2027-01-01', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', NULL, 'games insert: PENDING owner''s token denied despite scopes');

-- Update
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT is(tests.affected($$ UPDATE public.games SET location = 'x' WHERE id = '10000000-0000-0000-0000-00000000000b' $$), 1,
  'games update: APPROVED session, own event');
SELECT is(tests.affected($$ UPDATE public.games SET location = 'x' WHERE id = '10000000-0000-0000-0000-00000000000d' $$), 0,
  'games update: APPROVED session, someone else''s event denied');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT is(tests.affected($$ UPDATE public.games SET location = 'y' WHERE id = '10000000-0000-0000-0000-00000000000d' $$), 1,
  'games update: ADMIN session, any event');

SELECT tests.as_token('tok_appr_events');
SELECT is(tests.affected($$ UPDATE public.games SET location = 'z' WHERE id = '10000000-0000-0000-0000-00000000000b' $$), 1,
  'games update: APPROVED token, own event');
SELECT is(tests.affected($$ UPDATE public.games SET location = 'z' WHERE id = '10000000-0000-0000-0000-00000000000d' $$), 0,
  'games update: APPROVED token, someone else''s event denied');
SELECT tests.as_token('tok_appr_rsvp');
SELECT is(tests.affected($$ UPDATE public.games SET location = 'z' WHERE id = '10000000-0000-0000-0000-00000000000b' $$), 0,
  'games update: token without events:write denied');
SELECT tests.as_token('tok_admin_events');
SELECT is(tests.affected($$ UPDATE public.games SET location = 'w' WHERE id = '10000000-0000-0000-0000-00000000000d' $$), 1,
  'games update: ADMIN token with events:write, any event');
SELECT tests.as_token('tok_admin_none');
SELECT is(tests.affected($$ UPDATE public.games SET location = 'w' WHERE id = '10000000-0000-0000-0000-00000000000d' $$), 0,
  'games update: ADMIN token without scopes denied');

-- Delete
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT is(tests.affected($$ DELETE FROM public.games WHERE id = '10000000-0000-0000-0000-00000000000b' $$), 0,
  'games delete: APPROVED session denied, even own event');
SELECT tests.as_token('tok_admin_events');
SELECT is(tests.affected($$ DELETE FROM public.games WHERE id = '10000000-0000-0000-0000-0000000000ff' $$), 0,
  'games delete: ADMIN token without events:delete denied');
SELECT tests.as_token('tok_admin_all');
SELECT is(tests.affected($$ DELETE FROM public.games WHERE id = '10000000-0000-0000-0000-0000000000ff' $$), 1,
  'games delete: ADMIN token with events:delete');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT is(tests.affected($$ DELETE FROM public.games WHERE name = 's' $$), 1,
  'games delete: ADMIN session');

-- ============================================================ Attendance ====
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT lives_ok($$ INSERT INTO public.attendance (user_id, game_id, interest_level) VALUES ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000d', 'INTERESTED') $$,
  'attendance insert: APPROVED session, self');
SELECT throws_ok($$ INSERT INTO public.attendance (user_id, game_id, interest_level) VALUES ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000d', 'INTERESTED') $$,
  '42501', NULL, 'attendance insert: cannot RSVP for someone else');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000c');
SELECT throws_ok($$ INSERT INTO public.attendance (user_id, game_id, interest_level) VALUES ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000d', 'INTERESTED') $$,
  '42501', NULL, 'attendance insert: PENDING session denied');

SELECT tests.as_token('tok_appr_rsvp');
SELECT lives_ok($$ INSERT INTO public.attendance (user_id, game_id, interest_level) VALUES ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'REGISTERED') $$,
  'attendance insert: APPROVED token with attendance:write, self');
SELECT throws_ok($$ INSERT INTO public.attendance (user_id, game_id, interest_level) VALUES ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-00000000000b', 'REGISTERED') $$,
  '42501', NULL, 'attendance insert: token cannot RSVP for someone else');
SELECT is(tests.affected($$ UPDATE public.attendance SET interest_level = 'WATCHING' WHERE user_id = '00000000-0000-0000-0000-00000000000b' $$), 2,
  'attendance update: token, own rows');
SELECT tests.as_token('tok_appr_events');
SELECT throws_ok($$ INSERT INTO public.attendance (user_id, game_id, interest_level) VALUES ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 'REGISTERED') $$,
  '42501', NULL, 'attendance insert: token without attendance:write denied');
SELECT is(tests.affected($$ UPDATE public.attendance SET interest_level = 'NOT_GOING' WHERE user_id = '00000000-0000-0000-0000-00000000000b' $$), 0,
  'attendance update: token without attendance:write denied');
SELECT is(tests.affected($$ DELETE FROM public.attendance WHERE user_id = '00000000-0000-0000-0000-00000000000b' $$), 0,
  'attendance delete: token without attendance:write denied');
SELECT tests.as_token('tok_pend_all');
SELECT throws_ok($$ INSERT INTO public.attendance (user_id, game_id, interest_level) VALUES ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000000b', 'REGISTERED') $$,
  '42501', NULL, 'attendance insert: PENDING owner''s token denied despite scope');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT is(tests.affected($$ DELETE FROM public.attendance WHERE user_id = '00000000-0000-0000-0000-00000000000b' $$), 0,
  'attendance delete: even ADMIN cannot delete others'' RSVPs (unchanged)');
SELECT tests.as_token('tok_appr_rsvp');
SELECT is(tests.affected($$ DELETE FROM public.attendance WHERE user_id = '00000000-0000-0000-0000-00000000000b' $$), 2,
  'attendance delete: token, own rows');

-- ============================================================ User_Roles ====
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT is(tests.affected($$ UPDATE public.user_roles SET role = 'ADMIN' WHERE user_id = '00000000-0000-0000-0000-00000000000b' $$), 0,
  'roles: APPROVED session cannot self-promote');
SELECT tests.as_token('tok_admin_events');
SELECT is(tests.affected($$ UPDATE public.user_roles SET role = 'APPROVED' WHERE user_id = '00000000-0000-0000-0000-00000000000c' $$), 0,
  'roles: ADMIN token without users:admin denied');
SELECT tests.as_token('tok_admin_all');
SELECT is(tests.affected($$ UPDATE public.user_roles SET role = 'APPROVED' WHERE user_id = '00000000-0000-0000-0000-00000000000c' $$), 1,
  'roles: ADMIN token with users:admin can approve');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT is(tests.affected($$ UPDATE public.user_roles SET role = 'PENDING' WHERE user_id = '00000000-0000-0000-0000-00000000000c' $$), 1,
  'roles: ADMIN session (unchanged)');

-- Demotion takes effect immediately for the demoted user's tokens.
SELECT tests.as_owner();
UPDATE public.user_roles SET role = 'PENDING' WHERE user_id = '00000000-0000-0000-0000-00000000000b';
SELECT tests.as_token('tok_appr_events');
SELECT throws_ok($$ INSERT INTO public.games (name, start_date, created_by) VALUES ('t', '2027-01-01', '00000000-0000-0000-0000-00000000000b') $$,
  '42501', NULL, 'demoted owner: token loses write access immediately');
SELECT tests.as_owner();
UPDATE public.user_roles SET role = 'APPROVED' WHERE user_id = '00000000-0000-0000-0000-00000000000b';

-- ============================================================== Settings ====
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT is(tests.affected($$ UPDATE public.settings SET value = 'Club' WHERE key = 'club_name' $$), 1,
  'settings: ADMIN session (unchanged)');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT is(tests.affected($$ UPDATE public.settings SET value = 'Club' WHERE key = 'club_name' $$), 0,
  'settings: APPROVED session denied');
SELECT tests.as_token('tok_admin_all');
SELECT is(tests.affected($$ UPDATE public.settings SET value = 'Club' WHERE key = 'club_name' $$), 0,
  'settings: even a full-scope ADMIN token is denied (session only)');

-- =============================================================== Storage ====
-- Supabase's storage.protect_delete() trigger blocks direct DELETEs unless this
-- flag is set. Setting it keeps RLS and the role switches fully in effect.
SELECT set_config('storage.allow_delete_query', 'true', true);
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT lives_ok($$ INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('public_images', 'b.png', '00000000-0000-0000-0000-00000000000b') $$,
  'storage upload: APPROVED session (unchanged)');
SELECT tests.as_token('tok_admin_all');
SELECT throws_ok($$ INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('public_images', 't.png', '00000000-0000-0000-0000-00000000000a') $$,
  '42501', NULL, 'storage upload: tokens denied');
SELECT is(tests.affected($$ DELETE FROM storage.objects WHERE name = 'b.png' $$), 0,
  'storage delete: tokens denied even for an ADMIN owner');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT is(tests.affected($$ DELETE FROM storage.objects WHERE name = 'b.png' $$), 1,
  'storage delete: ADMIN session (unchanged)');

-- ============================================================ Public reads ==
SELECT tests.as_anon();
SELECT ok((SELECT count(*) FROM public.games) > 0, 'games remain publicly readable');
SELECT lives_ok($$ SELECT * FROM public.attendance $$, 'attendance remains publicly readable');
SELECT lives_ok($$ SELECT * FROM public.user_roles $$, 'roles remain publicly readable');
SELECT lives_ok($$ SELECT * FROM public.settings $$, 'settings remain publicly readable');

-- ================================================== authorize_user_deletion ==
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT lives_ok($$ SELECT public.authorize_user_deletion('00000000-0000-0000-0000-00000000000c') $$,
  'deletion: ADMIN session may delete another user');
SELECT throws_ok($$ SELECT public.authorize_user_deletion('00000000-0000-0000-0000-00000000000a') $$,
  'PT409', NULL, 'deletion: cannot delete yourself');
SELECT throws_ok($$ SELECT public.authorize_user_deletion('00000000-0000-0000-0000-0000000000ee') $$,
  'PT404', NULL, 'deletion: unknown user -> PT404');
SELECT tests.as_token('tok_admin_all');
SELECT lives_ok($$ SELECT public.authorize_user_deletion('00000000-0000-0000-0000-00000000000c') $$,
  'deletion: ADMIN token with users:admin');
SELECT tests.as_token('tok_admin_events');
SELECT throws_ok($$ SELECT public.authorize_user_deletion('00000000-0000-0000-0000-00000000000c') $$,
  '42501', NULL, 'deletion: ADMIN token without users:admin denied');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
SELECT throws_ok($$ SELECT public.authorize_user_deletion('00000000-0000-0000-0000-00000000000c') $$,
  '42501', NULL, 'deletion: non-admin denied');
SELECT tests.as_anon();
SELECT throws_ok($$ SELECT public.authorize_user_deletion('00000000-0000-0000-0000-00000000000c') $$,
  'PT401', NULL, 'deletion: anonymous -> PT401');

SELECT * FROM finish();
ROLLBACK;
