-- =============================================================================
-- Milestone 14 (part 2): Notification outbox
--
-- Notifications are recorded IN THE SAME TRANSACTION as the change that causes
-- them (by triggers that only fire on writes RLS already allowed), and are
-- delivered by trusted server-only code (lib/notifications/dispatch.ts).
-- Callers never read other members' email addresses; retries and idempotent
-- replays cannot create duplicate notifications. See Detailed_Design.md §3.7.
-- =============================================================================

CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('NEW_REGISTRATION', 'USER_APPROVED',
                                     'EVENT_CREATED', 'EVENT_UPDATED', 'EVENT_DELETED')),
  subject_id uuid,                -- user (registration/approval) or game id
  payload jsonb NOT NULL,         -- snapshot captured at write time (deletes still render)
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Frozen on the first claim, so every retry sends a byte-identical request
  -- under the same Resend idempotency key (the outbox id).
  recipients text[],
  first_attempt_at timestamptz,
  claimed_at timestamptz,         -- lease held by a dispatcher
  next_attempt_at timestamptz,    -- retry backoff after a failed attempt
  -- An attempt whose outcome is unknown (network error / 5xx / lost lease):
  -- the email may have been delivered. Only retried while Resend still
  -- deduplicates the idempotency key (24h); after that it needs a human.
  ambiguous boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX notification_outbox_pending_idx
  ON public.notification_outbox (created_at) WHERE sent_at IS NULL;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
-- No policies and no client privileges: only the server-only dispatcher
-- (service_role) and the SECURITY DEFINER functions below touch this table.
REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_outbox TO service_role;

-- Request header helper for the notification flags. Returns NULL outside a
-- PostgREST request (e.g. triggers fired by Supabase Auth or migrations).
CREATE OR REPLACE FUNCTION public.request_header(name text)
RETURNS text
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT nullif(current_setting('request.headers', true), '')::json ->> lower(name)
$$;
REVOKE EXECUTE ON FUNCTION public.request_header(text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Writers (SECURITY DEFINER triggers)
-- -----------------------------------------------------------------------------

-- Games: created / major update / deleted.
--   x-hcal-notify: false        suppresses create/delete emails (API `notify: false`)
--   x-hcal-major-change: true   sends an update email (UI checkbox / API `major_change`)
CREATE OR REPLACE FUNCTION public.enqueue_game_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  suppress boolean := lower(coalesce(public.request_header('x-hcal-notify'), '')) = 'false';
BEGIN
  IF TG_OP = 'INSERT' AND NOT suppress THEN
    INSERT INTO public.notification_outbox (kind, subject_id, payload)
    VALUES ('EVENT_CREATED', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE'
        AND lower(coalesce(public.request_header('x-hcal-major-change'), '')) = 'true' THEN
    INSERT INTO public.notification_outbox (kind, subject_id, payload)
    VALUES ('EVENT_UPDATED', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' AND NOT suppress THEN
    INSERT INTO public.notification_outbox (kind, subject_id, payload)
    VALUES ('EVENT_DELETED', OLD.id, to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER games_notify
  AFTER INSERT OR UPDATE OR DELETE ON public.games
  FOR EACH ROW EXECUTE PROCEDURE public.enqueue_game_notification();

-- User_Roles: PENDING -> APPROVED sends the "you're approved" email.
CREATE OR REPLACE FUNCTION public.enqueue_role_notification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'PENDING'::public.user_role AND NEW.role = 'APPROVED'::public.user_role THEN
    INSERT INTO public.notification_outbox (kind, subject_id, payload)
    SELECT 'USER_APPROVED', NEW.user_id, jsonb_build_object('display_name', p.display_name)
    FROM public.profiles p WHERE p.id = NEW.user_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER user_roles_notify
  AFTER UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE PROCEDURE public.enqueue_role_notification();

-- Signup: same profile/role creation as before, plus a registration notice for
-- admins. Replaces the "created within the last 60 seconds" heuristic in the
-- auth callback, so it fires exactly once per new user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.Profiles (id, email, display_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');

  INSERT INTO public.User_Roles (user_id, role)
  VALUES (new.id, 'PENDING');

  INSERT INTO public.notification_outbox (kind, subject_id, payload)
  VALUES ('NEW_REGISTRATION', new.id, jsonb_build_object(
    'display_name', coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Unknown User'),
    'email', new.email
  ));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------------------------------
-- Delivery helpers (service_role only)
-- -----------------------------------------------------------------------------

-- Recipients for a notification, from current membership (used once, on the
-- first claim). Byte order (COLLATE "C") keeps the list deterministic.
CREATE OR REPLACE FUNCTION public.notification_recipients(kind text, subject_id uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN kind = 'NEW_REGISTRATION' THEN ARRAY(
      SELECT p.email FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
       WHERE r.role = 'ADMIN' AND p.email IS NOT NULL ORDER BY p.email COLLATE "C")
    WHEN kind = 'USER_APPROVED' THEN ARRAY(
      SELECT p.email FROM public.profiles p WHERE p.id = subject_id AND p.email IS NOT NULL)
    ELSE ARRAY(
      SELECT p.email FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
       WHERE r.role IN ('APPROVED', 'ADMIN') AND p.email IS NOT NULL ORDER BY p.email COLLATE "C")
  END
$$;

-- Claim up to `batch` deliverable rows with a 5-minute lease. SKIP LOCKED lets
-- several dispatchers run concurrently without double-sending.
--
-- A row is deliverable when it is unsent, has attempts left, its retry
-- backoff has elapsed, its lease (if any) has expired, and it is not an
-- ambiguous attempt older than Resend's 24h idempotency window (resending
-- those could deliver a duplicate, so they are left for an admin to review).
-- A lease that expired without an outcome is itself ambiguous.
CREATE OR REPLACE FUNCTION public.claim_notifications(batch integer DEFAULT 20)
RETURNS TABLE (id uuid, kind text, subject_id uuid, payload jsonb, attempts integer, recipients text[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.notification_outbox o
       SET claimed_at = now(),
           attempts = o.attempts + 1,
           first_attempt_at = coalesce(o.first_attempt_at, now()),
           ambiguous = o.ambiguous OR o.claimed_at IS NOT NULL,
           recipients = coalesce(o.recipients, public.notification_recipients(o.kind, o.subject_id))
     WHERE o.id IN (
       SELECT n.id FROM public.notification_outbox n
        WHERE n.sent_at IS NULL
          AND n.attempts < 5
          AND (n.next_attempt_at IS NULL OR n.next_attempt_at <= now())
          AND (n.claimed_at IS NULL OR n.claimed_at < now() - interval '5 minutes')
          AND NOT ((n.ambiguous OR n.claimed_at IS NOT NULL)
                   AND n.first_attempt_at < now() - interval '23 hours')
        ORDER BY n.created_at
        LIMIT greatest(least(batch, 100), 1)
        FOR UPDATE SKIP LOCKED
     )
    RETURNING o.*
  )
  SELECT c.id, c.kind, c.subject_id, c.payload, c.attempts, c.recipients
  FROM claimed c
  ORDER BY c.created_at;
END;
$$;

-- Record the outcome of a claimed row. NULL error = sent. On failure, release
-- the lease and back off exponentially (5, 10, 20, 40 minutes), so a provider
-- outage can't burn every attempt in one dispatcher run. `uncertain` marks an
-- attempt that may have been delivered (network error / 5xx).
CREATE OR REPLACE FUNCTION public.complete_notification(
  notification_id uuid, error text DEFAULT NULL, uncertain boolean DEFAULT false)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.notification_outbox
     SET sent_at = CASE WHEN error IS NULL THEN now() ELSE NULL END,
         claimed_at = CASE WHEN error IS NULL THEN claimed_at ELSE NULL END,
         next_attempt_at = CASE WHEN error IS NULL THEN NULL
                                ELSE now() + interval '5 minutes' * power(2, greatest(attempts - 1, 0)) END,
         ambiguous = ambiguous OR (error IS NOT NULL AND uncertain),
         last_error = error
   WHERE id = notification_id
$$;

-- Mark a row as handled without sending (email not configured), keeping a reason.
CREATE OR REPLACE FUNCTION public.skip_notification(notification_id uuid, reason text)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.notification_outbox
     SET sent_at = now(), last_error = reason
   WHERE id = notification_id
$$;

REVOKE EXECUTE ON FUNCTION
  public.notification_recipients(text, uuid),
  public.claim_notifications(integer),
  public.complete_notification(uuid, text, boolean),
  public.skip_notification(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.claim_notifications(integer),
  public.complete_notification(uuid, text, boolean),
  public.skip_notification(uuid, text)
TO service_role;
