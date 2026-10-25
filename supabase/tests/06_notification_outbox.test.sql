-- pgTAP: notification outbox (triggers, flags, recipients, delivery helpers).
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- ---------------------------------------------------------------- helpers ---
CREATE SCHEMA tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated, service_role;
-- headers: extra request headers (e.g. the notify flags) as a JSON object.
CREATE FUNCTION tests.as_session(uid uuid, headers jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.headers', headers::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE FUNCTION tests.as_token(raw text, headers jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', (headers || jsonb_build_object('x-hcal-token', raw))::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
END $$;
CREATE FUNCTION tests.as_role(r text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', '{}', true);
  EXECUTE format('SET LOCAL ROLE %I', r);
END $$;
CREATE FUNCTION tests.as_owner() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.headers', '{}', true);
END $$;
CREATE FUNCTION tests.mk_user(uid uuid, email text, r public.user_role) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (uid, email, json_build_object('full_name', 'Name ' || email)::jsonb);
  UPDATE public.user_roles SET role = r WHERE user_id = uid;
END $$;
CREATE FUNCTION tests.mk_token(uid uuid, raw text, scopes text[]) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.api_tokens (user_id, name, token_hash, prefix, scopes)
  VALUES (uid, raw, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), left(raw, 12), scopes)
  RETURNING id
$$;
-- Outbox rows of a kind (bypasses RLS: runs as the test owner).
CREATE FUNCTION tests.outbox_count(k text) RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM public.notification_outbox WHERE kind = k
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO anon, authenticated, service_role;

-- --------------------------------------------------------------- fixtures ---
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000a', 'admin@example.com', 'ADMIN');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000b', 'approved@example.com', 'APPROVED');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000c', 'pending@example.com', 'PENDING');
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000e', 'admin2@example.com', 'ADMIN');
SELECT tests.mk_token('00000000-0000-0000-0000-00000000000a', 'hcal_pat_admin_events', ARRAY['events:write', 'events:delete']);

-- ======================================================== Registration =====
SELECT is(tests.outbox_count('NEW_REGISTRATION'), 4, 'signup: one NEW_REGISTRATION per new user');
SELECT is(
  (SELECT payload FROM public.notification_outbox
    WHERE kind = 'NEW_REGISTRATION' AND subject_id = '00000000-0000-0000-0000-00000000000c'),
  '{"display_name": "Name pending@example.com", "email": "pending@example.com"}'::jsonb,
  'signup: payload carries the display name and email');
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ('00000000-0000-0000-0000-0000000000f0', 'noname@example.com', '{}');
SELECT is(
  (SELECT payload ->> 'display_name' FROM public.notification_outbox WHERE subject_id = '00000000-0000-0000-0000-0000000000f0'),
  'noname@example.com', 'signup: display name falls back to the email (as before)');
SELECT is((SELECT role::text FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-0000000000f0'),
  'PENDING', 'signup: still creates the PENDING role');
DELETE FROM public.notification_outbox;

-- =============================================================== Approval ==
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
UPDATE public.user_roles SET role = 'APPROVED' WHERE user_id = '00000000-0000-0000-0000-00000000000c';
SELECT tests.as_owner();
SELECT is(tests.outbox_count('USER_APPROVED'), 1, 'approval: PENDING -> APPROVED enqueues USER_APPROVED');
SELECT is((SELECT payload ->> 'display_name' FROM public.notification_outbox WHERE kind = 'USER_APPROVED'),
  'Name pending@example.com', 'approval: payload carries the display name');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
UPDATE public.user_roles SET role = 'ADMIN' WHERE user_id = '00000000-0000-0000-0000-00000000000c';
SELECT tests.as_owner();
SELECT is(tests.outbox_count('USER_APPROVED'), 1, 'approval: APPROVED -> ADMIN (promotion) sends nothing');
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
UPDATE public.user_roles SET role = 'APPROVED' WHERE user_id = '00000000-0000-0000-0000-0000000000f0';
SELECT tests.as_owner();
SELECT is(tests.outbox_count('USER_APPROVED'), 1, 'approval: a non-admin''s (RLS-denied) update enqueues nothing');
DELETE FROM public.notification_outbox;

-- ================================================================= Events ==
SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
INSERT INTO public.games (id, name, start_date, type, start_time, created_by)
  VALUES ('10000000-0000-0000-0000-000000000001', 'Tournament', '2026-11-01', 'EVENT', '15:00', '00000000-0000-0000-0000-00000000000b');
SELECT tests.as_owner();
SELECT is(tests.outbox_count('EVENT_CREATED'), 1, 'create: enqueues EVENT_CREATED');
SELECT is((SELECT payload ->> 'name' FROM public.notification_outbox WHERE kind = 'EVENT_CREATED'),
  'Tournament', 'create: payload snapshots the event');

SELECT tests.as_session('00000000-0000-0000-0000-00000000000b', '{"x-hcal-notify": "false"}');
INSERT INTO public.games (id, name, start_date, created_by)
  VALUES ('10000000-0000-0000-0000-000000000002', 'Quiet', '2026-11-02', '00000000-0000-0000-0000-00000000000b');
SELECT tests.as_owner();
SELECT is(tests.outbox_count('EVENT_CREATED'), 1, 'create: x-hcal-notify=false suppresses the email');

SELECT tests.as_session('00000000-0000-0000-0000-00000000000b');
UPDATE public.games SET location = 'Rink A' WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT tests.as_owner();
SELECT is(tests.outbox_count('EVENT_UPDATED'), 0, 'update: minor change sends nothing (default)');

SELECT tests.as_session('00000000-0000-0000-0000-00000000000b', '{"x-hcal-major-change": "true"}');
UPDATE public.games SET start_date = '2026-11-08' WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT tests.as_owner();
SELECT is(tests.outbox_count('EVENT_UPDATED'), 1, 'update: x-hcal-major-change=true enqueues EVENT_UPDATED');
SELECT is((SELECT payload ->> 'start_date' FROM public.notification_outbox WHERE kind = 'EVENT_UPDATED'),
  '2026-11-08', 'update: payload has the new values');

-- RLS-denied writes enqueue nothing (APPROVED member e is an admin here; use c? c is ADMIN now)
SELECT tests.mk_user('00000000-0000-0000-0000-00000000000d', 'other@example.com', 'APPROVED');
DELETE FROM public.notification_outbox WHERE kind = 'NEW_REGISTRATION';
SELECT tests.as_session('00000000-0000-0000-0000-00000000000d', '{"x-hcal-major-change": "true"}');
UPDATE public.games SET name = 'Hijacked' WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT tests.as_owner();
SELECT is(tests.outbox_count('EVENT_UPDATED'), 1, 'update: someone else''s (RLS-denied) update enqueues nothing');

-- Deletes via a PAT (the API path) behave the same way.
SELECT tests.as_token('hcal_pat_admin_events', '{"x-hcal-notify": "false"}');
DELETE FROM public.games WHERE id = '10000000-0000-0000-0000-000000000002';
SELECT tests.as_owner();
SELECT is(tests.outbox_count('EVENT_DELETED'), 0, 'delete: x-hcal-notify=false suppresses the email');
SELECT tests.as_token('hcal_pat_admin_events');
DELETE FROM public.games WHERE id = '10000000-0000-0000-0000-000000000001';
SELECT tests.as_owner();
SELECT is(tests.outbox_count('EVENT_DELETED'), 1, 'delete: enqueues EVENT_DELETED');
SELECT is((SELECT payload ->> 'name' FROM public.notification_outbox WHERE kind = 'EVENT_DELETED'),
  'Tournament', 'delete: payload keeps the deleted event''s name');

-- ================================================================ Privacy ==
SELECT tests.as_session('00000000-0000-0000-0000-00000000000a');
SELECT throws_ok($$ SELECT count(*) FROM public.notification_outbox $$, '42501', NULL,
  'session: outbox is not readable (even by admins)');
SELECT throws_ok($$ SELECT * FROM public.claim_notifications(10) $$, '42501', NULL,
  'session: cannot claim notifications (would expose emails)');
SELECT throws_ok($$ SELECT public.complete_notification(gen_random_uuid(), gen_random_uuid(), NULL) $$, '42501', NULL,
  'session: cannot mark notifications sent');
SELECT throws_ok($$ INSERT INTO public.notification_outbox (kind, payload) VALUES ('EVENT_CREATED', '{}') $$, '42501', NULL,
  'session: cannot enqueue arbitrary notifications');
SELECT tests.as_token('hcal_pat_admin_events');
SELECT throws_ok($$ SELECT count(*) FROM public.notification_outbox $$, '42501', NULL,
  'token: outbox is not readable');
SELECT throws_ok($$ SELECT * FROM public.claim_notifications(10) $$, '42501', NULL,
  'token: cannot claim notifications');

-- =============================================================== Delivery ==
SELECT tests.as_owner();
CREATE TABLE tests.leases (id uuid PRIMARY KEY, token uuid);
GRANT ALL ON tests.leases TO service_role;
CREATE FUNCTION tests.claim(n int) RETURNS SETOF uuid LANGUAGE sql AS $$
  INSERT INTO tests.leases (id, token)
    SELECT id, claim_token FROM public.claim_notifications(n)
  ON CONFLICT (id) DO UPDATE SET token = excluded.token
  RETURNING id
$$;
CREATE FUNCTION tests.tok(i uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT token FROM tests.leases WHERE id = i $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO service_role;
SELECT tests.as_owner();
DELETE FROM public.notification_outbox;
INSERT INTO public.notification_outbox (id, kind, subject_id, payload, created_at) VALUES
  ('20000000-0000-0000-0000-000000000001', 'EVENT_CREATED', NULL, '{"name": "A"}', now() - interval '3 min'),
  ('20000000-0000-0000-0000-000000000002', 'NEW_REGISTRATION', '00000000-0000-0000-0000-0000000000f0', '{}', now() - interval '2 min'),
  ('20000000-0000-0000-0000-000000000003', 'USER_APPROVED', '00000000-0000-0000-0000-0000000000f0', '{}', now() - interval '1 min');

SELECT tests.as_role('service_role');
SELECT tests.claim(10);
CREATE TEMP TABLE claim1 AS SELECT n.id, n.kind, n.subject_id, n.payload, n.created_at, n.attempts, n.recipients, l.token AS claim_token FROM public.notification_outbox n JOIN tests.leases l ON l.id = n.id WHERE n.id IN ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003');
SELECT is((SELECT count(*)::int FROM claim1), 3, 'claim: returns all pending rows');
SELECT is((SELECT array_agg(id ORDER BY ord) FROM (SELECT id, row_number() OVER () ord FROM claim1) s),
  ARRAY['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003']::uuid[],
  'claim: oldest first');
SELECT is((SELECT recipients FROM claim1 WHERE kind = 'EVENT_CREATED'),
  ARRAY['admin2@example.com', 'admin@example.com', 'approved@example.com', 'other@example.com', 'pending@example.com'],
  'recipients: event emails go to every APPROVED/ADMIN member, byte-ordered (c was promoted)');
SELECT is((SELECT recipients FROM claim1 WHERE kind = 'NEW_REGISTRATION'),
  ARRAY['admin2@example.com', 'admin@example.com', 'pending@example.com'],
  'recipients: registration notices go to admins only');
SELECT is((SELECT recipients FROM claim1 WHERE kind = 'USER_APPROVED'),
  ARRAY['noname@example.com'], 'recipients: approval goes to the approved user only');
SELECT is((SELECT count(*)::int FROM public.claim_notifications(10)), 0,
  'claim: claimed rows are leased (not handed out twice)');

SELECT public.complete_notification('20000000-0000-0000-0000-000000000001', tests.tok('20000000-0000-0000-0000-000000000001'::uuid), NULL);
SELECT public.complete_notification('20000000-0000-0000-0000-000000000002', tests.tok('20000000-0000-0000-0000-000000000002'::uuid), 'rate_limit_exceeded: slow down');
SELECT public.skip_notification('20000000-0000-0000-0000-000000000003', tests.tok('20000000-0000-0000-0000-000000000003'::uuid), 'email disabled');
SELECT ok((SELECT sent_at IS NOT NULL FROM public.notification_outbox WHERE id = '20000000-0000-0000-0000-000000000001'),
  'complete: success marks the row sent');
SELECT ok((SELECT sent_at IS NULL AND claimed_at IS NULL AND NOT ambiguous AND last_error = 'rate_limit_exceeded: slow down'
             FROM public.notification_outbox WHERE id = '20000000-0000-0000-0000-000000000002'),
  'complete: definite failure releases the lease, records the error, is not ambiguous');
SELECT is((SELECT count(*)::int FROM public.claim_notifications(10)), 0,
  'backoff: a failed row is not retried immediately (same dispatcher run)');
SELECT tests.as_owner();
SELECT ok((SELECT next_attempt_at BETWEEN now() + interval '4 minutes' AND now() + interval '6 minutes'
             FROM public.notification_outbox WHERE id = '20000000-0000-0000-0000-000000000002'),
  'backoff: first retry is ~5 minutes out');

-- Recipients are frozen on the first claim: a membership change before the
-- retry must not change the request sent under the same idempotency key.
UPDATE public.user_roles SET role = 'APPROVED' WHERE user_id = '00000000-0000-0000-0000-00000000000e';
UPDATE public.notification_outbox SET next_attempt_at = now() - interval '1 second'
 WHERE id = '20000000-0000-0000-0000-000000000002';
SELECT tests.as_role('service_role');
SELECT tests.claim(10);
CREATE TEMP TABLE claim2 AS SELECT n.id, n.kind, n.subject_id, n.payload, n.created_at, n.attempts, n.recipients, l.token AS claim_token FROM public.notification_outbox n JOIN tests.leases l ON l.id = n.id WHERE n.id = '20000000-0000-0000-0000-000000000002';
SELECT is((SELECT array_agg(id) FROM claim2), ARRAY['20000000-0000-0000-0000-000000000002']::uuid[],
  'retry: only the failed row is reclaimed once its backoff elapses');
SELECT is((SELECT recipients FROM claim2), ARRAY['admin2@example.com', 'admin@example.com', 'pending@example.com'],
  'retry: recipients are the ones frozen at the first attempt (admin2 was demoted since)');
SELECT is((SELECT attempts FROM claim2), 2, 'retry: attempt counter increments');
SELECT public.complete_notification('20000000-0000-0000-0000-000000000002'::uuid, tests.tok('20000000-0000-0000-0000-000000000002'::uuid), 'internal_server_error: boom', true);
SELECT tests.as_owner();
SELECT ok((SELECT ambiguous AND next_attempt_at BETWEEN now() + interval '9 minutes' AND now() + interval '11 minutes'
             FROM public.notification_outbox WHERE id = '20000000-0000-0000-0000-000000000002'),
  'uncertain failure: marked ambiguous; backoff doubles to ~10 minutes');

-- A full batch of failures cannot exhaust attempts within one dispatcher run.
DELETE FROM public.notification_outbox;
INSERT INTO public.notification_outbox (kind, payload)
  SELECT 'EVENT_CREATED', jsonb_build_object('name', 'E' || g) FROM generate_series(1, 20) g;
SELECT tests.as_role('service_role');
SELECT tests.claim(20);
SELECT public.complete_notification(n.id, l.token, 'rate_limit_exceeded: slow down') FROM public.notification_outbox n JOIN tests.leases l ON l.id = n.id;
SELECT is((SELECT count(*)::int FROM public.claim_notifications(20)), 0,
  'outage: a full failed batch is not reclaimed in the next round');
SELECT tests.as_owner();
SELECT is((SELECT max(attempts) FROM public.notification_outbox), 1, 'outage: each row used only one attempt');

-- Give-up after 5 attempts.
DELETE FROM public.notification_outbox;
INSERT INTO public.notification_outbox (id, kind, payload, attempts, first_attempt_at)
  VALUES ('20000000-0000-0000-0000-000000000004', 'EVENT_CREATED', '{}', 5, now());
SELECT tests.as_role('service_role');
SELECT is((SELECT count(*)::int FROM public.claim_notifications(10)), 0, 'retry: gives up after 5 attempts');

-- Expired lease (dispatcher crashed mid-send): reclaimed while Resend still
-- deduplicates the key (<24h), and marked ambiguous.
SELECT tests.as_owner();
DELETE FROM public.notification_outbox;
INSERT INTO public.notification_outbox (id, kind, payload, attempts, recipients, first_attempt_at, claimed_at)
  VALUES ('20000000-0000-0000-0000-000000000005', 'EVENT_CREATED', '{}', 1, ARRAY['x@example.com'],
          now() - interval '6 minutes', now() - interval '6 minutes');
SELECT tests.as_role('service_role');
SELECT is((SELECT count(*)::int FROM public.claim_notifications(10)), 1,
  'lease: an expired lease (crashed dispatcher) is reclaimed within the dedupe window');
SELECT tests.as_owner();
SELECT ok((SELECT ambiguous FROM public.notification_outbox WHERE id = '20000000-0000-0000-0000-000000000005'),
  'lease: the reclaimed row is flagged ambiguous');

-- Outside Resend's 24h idempotency window an ambiguous row is never resent
-- automatically (it might duplicate); it is left for review. A definite
-- failure is still retried after 24h (nothing was delivered).
DELETE FROM public.notification_outbox;
INSERT INTO public.notification_outbox (id, kind, payload, attempts, first_attempt_at, claimed_at, ambiguous, last_error) VALUES
  ('20000000-0000-0000-0000-000000000006', 'EVENT_CREATED', '{}', 1, now() - interval '25 hours', now() - interval '25 hours', false, NULL),
  ('20000000-0000-0000-0000-000000000007', 'EVENT_CREATED', '{}', 1, now() - interval '25 hours', NULL, true, 'internal_server_error'),
  ('20000000-0000-0000-0000-000000000008', 'EVENT_CREATED', '{}', 1, now() - interval '25 hours', NULL, false, 'rate_limit_exceeded');
SELECT tests.as_role('service_role');
SELECT is((SELECT array_agg(id) FROM public.claim_notifications(10)), ARRAY['20000000-0000-0000-0000-000000000008']::uuid[],
  'dedupe window: ambiguous rows (lost lease or uncertain error) older than 23h are not resent; definite failures are');

SELECT * FROM finish();
ROLLBACK;
