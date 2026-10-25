-- pgTAP: drift guards. These fail CI when someone adds a policy or a
-- SECURITY DEFINER function that could let tokens bypass the model.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- 1. Policy invariant: any write policy that grants access based on
--    is_admin(), is_approved_or_admin(), or current_actor_id() must also
--    check has_scope(...) or is_session(). Otherwise a new table could give
--    every token write access.
SELECT is(
  ARRAY(
    SELECT schemaname || '.' || tablename || ': ' || policyname
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
          ~ '(is_admin|is_approved_or_admin|current_actor_id)\('
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
          !~ '(has_scope|is_session)\('
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'every role/actor-based write policy also checks has_scope() or is_session()'
);

-- 2. No write policy may still use auth.uid() alone for ownership on tables
--    that the API exposes (it would silently ignore tokens or, worse, be
--    inconsistent with current_actor_id()).
SELECT is(
  ARRAY(
    SELECT tablename || ': ' || policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('games', 'attendance', 'user_roles')
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'auth\.uid\('
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'API-exposed tables use current_actor_id(), not auth.uid(), in write policies'
);

-- 3. Every table in public has RLS enabled.
SELECT is(
  ARRAY(
    SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    ORDER BY 1
  ),
  ARRAY[]::text[],
  'every public table has RLS enabled'
);

-- 4. SECURITY DEFINER functions bypass RLS, so the set that clients can
--    execute is an explicit, reviewed allowlist. Adding one fails CI until it
--    is reviewed, added here, and given its own tests.
SELECT is(
  ARRAY(
    SELECT p.proname::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ORDER BY 1
  ),
  ARRAY[
    'api_authenticate',
    'api_rate_limit_anonymous',
    'authorize_user_deletion',
    'current_actor_id',
    'current_token_id',
    'get_user_private',
    'has_scope',
    'is_admin',
    'is_approved_or_admin',
    'is_session',
    'revoke_api_token'
  ]::text[],
  'client-executable SECURITY DEFINER functions match the reviewed allowlist'
);

-- 5. Internal helpers stay internal.
SELECT ok(NOT has_function_privilege('anon', 'public.api_rate_limit_hit(text, integer)', 'EXECUTE'),
  'api_rate_limit_hit is not executable by anon');
SELECT ok(NOT has_function_privilege('authenticated', 'public.api_rate_limit_hit(text, integer)', 'EXECUTE'),
  'api_rate_limit_hit is not executable by authenticated');

SELECT ok(NOT has_function_privilege(r, 'public.request_token()', 'EXECUTE'), r || ' cannot call request_token() (returns token_hash)')
  FROM unnest(ARRAY['anon', 'authenticated']) r;

-- Notification outbox: server-only (service_role). Clients can neither read it
-- (it resolves member emails) nor write to it (arbitrary emails).
SELECT ok(NOT has_table_privilege(r, 'public.notification_outbox', p), r || ' has no ' || p || ' on notification_outbox')
  FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;
SELECT ok(NOT has_function_privilege(r, f, 'EXECUTE'), r || ' cannot execute ' || f)
  FROM unnest(ARRAY['anon', 'authenticated']) r,
       unnest(ARRAY['public.claim_notifications(integer)', 'public.complete_notification(uuid, text, boolean)',
                    'public.skip_notification(uuid, text)', 'public.request_header(text)',
                    'public.notification_recipients(text, uuid)']) f;

-- 6. api_create_event must run with the caller's privileges (RLS applies).
SELECT is((SELECT prosecdef FROM pg_proc WHERE proname = 'api_create_event'), false,
  'api_create_event is SECURITY INVOKER');

-- 7. Token table: no client UPDATE/DELETE privileges at all.
SELECT ok(NOT has_table_privilege(r, 'public.api_tokens', p), r || ' has no ' || p || ' on api_tokens')
  FROM unnest(ARRAY['anon', 'authenticated']) r, unnest(ARRAY['UPDATE', 'DELETE', 'TRUNCATE']) p;
SELECT ok(NOT has_column_privilege(r, 'public.api_tokens', 'token_hash', 'SELECT'), r || ' cannot select token_hash')
  FROM unnest(ARRAY['anon', 'authenticated']) r;
SELECT ok(NOT has_table_privilege('anon', 'public.api_tokens', 'INSERT'), 'anon (token requests) cannot insert tokens');

SELECT * FROM finish();
ROLLBACK;
