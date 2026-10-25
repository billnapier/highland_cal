import type { SupabaseClient } from '@supabase/supabase-js'
import { renderNotification, type ClaimedNotification, type EmailMessage } from './render'

// Notification dispatcher: drains public.notification_outbox.
//
// This is one of exactly two sanctioned service-role uses (see AGENTS.md). It
// is safe because it takes NO caller input: rows can only be written by the
// SECURITY DEFINER triggers in the notification_outbox migration, which fire
// only on writes RLS already allowed. Never add parameters that let a caller
// choose recipients or content.

/**
 * Send one email. `uncertain` means the provider may have accepted it anyway
 * (network error, timeout, 5xx). Definite rejections (4xx) are not uncertain.
 */
export type SendEmail = (
  message: EmailMessage & { from: string },
  idempotencyKey: string
) => Promise<{ error: string | null; uncertain?: boolean }>

export interface DispatchDeps {
  /** Service-role client. */
  supabase: SupabaseClient
  /** null when email is not configured (RESEND_API_KEY unset). */
  send: SendEmail | null
  from: string
  appUrl: string
  initialAdminEmail?: string
  /** Upper bound on notifications handled per call, so one call can't run forever. */
  maxNotifications?: number
}

export interface DispatchResult {
  sent: number
  failed: number
  skipped: number
}

/**
 * Drain the outbox one notification at a time. Each row is claimed
 * immediately before it is sent, so a claim always marks a real provider
 * attempt, and a crash mid-run never strands rows that were never tried.
 */
export async function dispatchNotifications(deps: DispatchDeps): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0 }
  const max = deps.maxNotifications ?? 100

  for (let i = 0; i < max; i++) {
    const { data, error } = await deps.supabase.rpc('claim_notifications', { batch: 1 })
    if (error) throw new Error(`claim_notifications failed: ${error.message}`)
    const row = ((data ?? []) as ClaimedNotification[])[0]
    if (!row) break
    const lease = { notification_id: row.id, token: row.claim_token }

    const message = renderNotification(row, {
      appUrl: deps.appUrl,
      initialAdminEmail: deps.initialAdminEmail,
    })
    // Same behavior as before the outbox: with email disabled or nobody to
    // notify, nothing is sent. Mark the row handled so it isn't retried.
    if (!deps.send || !message) {
      const reason = !deps.send ? 'email disabled' : 'no recipients'
      await settle(deps.supabase, 'skip_notification', { ...lease, reason })
      result.skipped++
      continue
    }

    // The outbox id is the Resend idempotency key, and recipients are frozen
    // on the first claim, so a retry sends a byte-identical request: if we
    // crashed after Resend accepted it, the retry is deduplicated (Resend
    // keeps keys for 24h; the claim rules stop retrying ambiguous rows
    // before that window closes).
    let sendError: string | null
    let uncertain = false
    try {
      ;({ error: sendError, uncertain = false } = await deps.send({ ...message, from: deps.from }, row.id))
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e)
      uncertain = true
    }
    await settle(deps.supabase, 'complete_notification', {
      ...lease,
      error: sendError ? sendError.slice(0, 500) : null,
      uncertain,
    })
    if (sendError) {
      console.error('Notification send failed', { id: row.id, kind: row.kind, error: sendError })
      result.failed++
    } else {
      result.sent++
    }
  }
  return result
}

async function settle(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args)
  // An unrecorded outcome is not lost: the lease expires after 5 minutes and
  // the row is retried (deduplicated by the idempotency key) or flagged.
  if (error) console.error(`${fn} failed`, { id: args.notification_id, error: error.message })
  // false = our lease had already expired and been swept or re-claimed.
  else if (data === false) console.warn(`${fn}: stale lease, outcome ignored`, { id: args.notification_id })
}
