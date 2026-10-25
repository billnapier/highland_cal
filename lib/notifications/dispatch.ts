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
  batchSize?: number
  /** Upper bound on claim rounds per call, so one call can't run forever. */
  maxBatches?: number
}

export interface DispatchResult {
  sent: number
  failed: number
  skipped: number
}

export async function dispatchNotifications(deps: DispatchDeps): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0 }
  const batchSize = deps.batchSize ?? 20
  const maxBatches = deps.maxBatches ?? 5

  for (let round = 0; round < maxBatches; round++) {
    const { data, error } = await deps.supabase.rpc('claim_notifications', { batch: batchSize })
    if (error) throw new Error(`claim_notifications failed: ${error.message}`)
    const rows = (data ?? []) as ClaimedNotification[]

    for (const row of rows) {
      const message = renderNotification(row, {
        appUrl: deps.appUrl,
        initialAdminEmail: deps.initialAdminEmail,
      })
      // Same behavior as before the outbox: with email disabled or nobody to
      // notify, nothing is sent. Mark the row handled so it isn't retried.
      if (!deps.send || !message) {
        const reason = !deps.send ? 'email disabled' : 'no recipients'
        await settle(deps.supabase, 'skip_notification', { notification_id: row.id, reason })
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
        notification_id: row.id,
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

    if (rows.length < batchSize) break
  }
  return result
}

async function settle(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args)
  // The lease expires after 5 minutes, so an unrecorded outcome is retried
  // (and deduplicated by the idempotency key) rather than lost.
  if (error) console.error(`${fn} failed`, { id: args.notification_id, error: error.message })
}
