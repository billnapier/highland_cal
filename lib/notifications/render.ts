import type { ReactElement } from 'react'
import NewRegistrationEmail from '@/emails/NewRegistrationEmail'
import UserApprovedEmail from '@/emails/UserApprovedEmail'
import EventNotificationEmail from '@/emails/EventNotificationEmail'

// Rendering of outbox rows into emails. Pure: no I/O, so it is unit-tested
// directly (lib/notifications/render.test.ts).

export type OutboxKind =
  | 'NEW_REGISTRATION'
  | 'USER_APPROVED'
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_DELETED'

export interface ClaimedNotification {
  id: string
  kind: OutboxKind
  subject_id: string | null
  payload: Record<string, unknown>
  attempts: number
  recipients: string[]
}

export interface EmailMessage {
  to: string | string[]
  bcc?: string[]
  subject: string
  react: ReactElement
}

export interface RenderOptions {
  appUrl: string
  /** Visible "to" address for event emails (recipients are bcc'd). */
  initialAdminEmail?: string
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined

/** Postgres `time` renders as "15:00:00"; the UI stores and shows "15:00". */
export function formatTime(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  return /^\d{2}:\d{2}:00$/.test(s) ? s.slice(0, 5) : s
}

const EVENT_ACTION = {
  EVENT_CREATED: { action: 'CREATE', subject: 'New Event' },
  EVENT_UPDATED: { action: 'UPDATE', subject: 'Event Updated' },
  EVENT_DELETED: { action: 'DELETE', subject: 'Event Canceled' },
} as const

/**
 * Turn one claimed outbox row into an email, or null when there is nobody to
 * send it to. Subjects, templates and addressing match the pre-outbox
 * behavior of the former lib/email.ts exactly.
 */
export function renderNotification(
  n: ClaimedNotification,
  opts: RenderOptions
): EmailMessage | null {
  if (n.recipients.length === 0) return null
  const dashboardUrl = `${opts.appUrl}/dashboard`
  const p = n.payload

  switch (n.kind) {
    case 'NEW_REGISTRATION': {
      const displayName = str(p.display_name) ?? str(p.email) ?? 'Unknown User'
      return {
        to: n.recipients,
        subject: 'New User Registration: ' + displayName,
        react: NewRegistrationEmail({ displayName, email: str(p.email) ?? '' }),
      }
    }
    case 'USER_APPROVED': {
      const displayName = str(p.display_name) ?? n.recipients[0].split('@')[0]
      return {
        to: n.recipients[0],
        subject: 'Your Highland Cal account has been approved!',
        react: UserApprovedEmail({ displayName, dashboardUrl }),
      }
    }
    case 'EVENT_CREATED':
    case 'EVENT_UPDATED':
    case 'EVENT_DELETED': {
      const { action, subject } = EVENT_ACTION[n.kind]
      const name = str(p.name) ?? 'Unknown Event'
      const type = p.type === 'PRACTICE' ? 'PRACTICE' : p.type === 'EVENT' ? 'EVENT' : undefined
      return {
        to: opts.initialAdminEmail || n.recipients[0],
        bcc: n.recipients,
        subject: `${subject}: ${name}`,
        react: EventNotificationEmail({
          actionType: action,
          eventName: name,
          startDate: str(p.start_date),
          isTwoDay: p.is_two_day === true,
          eventType: type,
          startTime: formatTime(p.start_time),
          endTime: formatTime(p.end_time),
          location: str(p.location),
          registrationUrl: str(p.registration_url),
          dashboardUrl,
        }),
      }
    }
    default:
      return null
  }
}
