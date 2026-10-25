import { after } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchNotifications, type DispatchResult, type SendEmail } from './dispatch'

// Production wiring for the dispatcher. Server-only.

function resendSender(): SendEmail | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  const resend = new Resend(apiKey)
  return async (message, idempotencyKey) => {
    const { error } = await resend.emails.send(message, { idempotencyKey })
    return { error: error ? `${error.name}: ${error.message}` : null }
  }
}

export function runDispatcher(): Promise<DispatchResult> {
  return dispatchNotifications({
    supabase: createAdminClient(),
    send: resendSender(),
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL,
  })
}

/**
 * Deliver pending notifications after the response is sent. Call after any
 * successful mutation that may have enqueued one. Failures are logged and
 * retried by the next kick or the daily cron (/api/cron/notifications).
 */
export function kickNotifications() {
  after(async () => {
    try {
      const r = await runDispatcher()
      if (r.sent || r.failed) console.log('Notifications dispatched', r)
    } catch (error) {
      console.error('Notification dispatch failed', error)
    }
  })
}

/** Request headers the outbox triggers read (see the notification_outbox migration). */
export const NOTIFY_HEADER = 'x-hcal-notify'
export const MAJOR_CHANGE_HEADER = 'x-hcal-major-change'
