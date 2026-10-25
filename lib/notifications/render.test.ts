import { describe, expect, it } from 'vitest'
import { render } from '@react-email/components'
import EventNotificationEmail from '@/emails/EventNotificationEmail'
import { formatTime, renderNotification, type ClaimedNotification } from './render'

const opts = { appUrl: 'https://club.example', initialAdminEmail: 'founder@example.com' }

function row(partial: Partial<ClaimedNotification>): ClaimedNotification {
  return {
    id: '20000000-0000-0000-0000-000000000001',
    claim_token: '30000000-0000-0000-0000-000000000001',
    kind: 'EVENT_CREATED',
    subject_id: null,
    payload: {},
    attempts: 1,
    recipients: ['a@example.com', 'b@example.com'],
    ...partial,
  }
}

// Mirrors to_jsonb(games row) as written by the trigger.
const game = {
  id: '10000000-0000-0000-0000-000000000001',
  name: 'Pleasanton Games',
  start_date: '2027-09-04',
  is_two_day: true,
  type: 'EVENT',
  start_time: null,
  end_time: null,
  location: 'Alameda County Fairgrounds',
  registration_url: 'https://example.com/register',
  created_by: '00000000-0000-0000-0000-00000000000b',
  created_at: '2026-10-25T00:00:00Z',
}

describe('renderNotification', () => {
  it('returns null when there is nobody to notify', () => {
    expect(renderNotification(row({ recipients: [] }), opts)).toBeNull()
  })

  it('event created: bcc every member, visible "to" is the initial admin, same subject as before', async () => {
    const m = renderNotification(row({ kind: 'EVENT_CREATED', payload: game }), opts)!
    expect(m.subject).toBe('New Event: Pleasanton Games')
    expect(m.to).toBe('founder@example.com')
    expect(m.bcc).toEqual(['a@example.com', 'b@example.com'])
    const html = await render(m.react)
    expect(html).toContain('New Event Added')
    expect(html).toContain('Alameda County Fairgrounds')
    expect(html).toContain('Sep 4, 2027 - Sep 5, 2027')
    expect(html).toContain('https://club.example/dashboard')
  })

  it('falls back to the first recipient when INITIAL_ADMIN_EMAIL is unset', () => {
    const m = renderNotification(row({ payload: game }), { appUrl: opts.appUrl })!
    expect(m.to).toBe('a@example.com')
  })

  it('event updated / deleted subjects match the old ones', async () => {
    expect(renderNotification(row({ kind: 'EVENT_UPDATED', payload: game }), opts)!.subject).toBe(
      'Event Updated: Pleasanton Games'
    )
    const del = renderNotification(row({ kind: 'EVENT_DELETED', payload: game }), opts)!
    expect(del.subject).toBe('Event Canceled: Pleasanton Games')
    const html = await render(del.react)
    expect(html).toContain('Event Canceled')
    expect(html).not.toContain('View on Dashboard')
  })

  it('delete renders exactly what the old code sent (name only), for events and practices', async () => {
    // The old deleteEvent() passed only { name }, so practices also read "Event Canceled".
    const old = await render(
      EventNotificationEmail({ actionType: 'DELETE', eventName: 'Tuesday Practice', dashboardUrl: 'https://club.example/dashboard' })
    )
    for (const type of ['EVENT', 'PRACTICE']) {
      const m = renderNotification(
        row({ kind: 'EVENT_DELETED', payload: { ...game, name: 'Tuesday Practice', type, start_time: '18:00:00' } }),
        opts
      )!
      expect(await render(m.react)).toBe(old)
    }
  })

  it('practice: Postgres times ("15:00:00") render as the UI stores them ("15:00")', async () => {
    const practice = { ...game, type: 'PRACTICE', is_two_day: false, start_time: '15:00:00', end_time: '16:30:00' }
    const m = renderNotification(row({ payload: practice }), opts)!
    const html = await render(m.react)
    expect(html).toContain('New Practice Added')
    expect(html).toContain('from 15:00 to 16:30')
  })

  it('new registration goes to the admins with the new user details', async () => {
    const m = renderNotification(
      row({
        kind: 'NEW_REGISTRATION',
        payload: { display_name: 'Jamie Lee', email: 'jamie@example.com' },
        recipients: ['admin@example.com'],
      }),
      opts
    )!
    expect(m.subject).toBe('New User Registration: Jamie Lee')
    expect(m.to).toEqual(['admin@example.com'])
    expect(m.bcc).toBeUndefined()
    expect(await render(m.react)).toContain('jamie@example.com')
  })

  it('user approved goes only to that user', () => {
    const m = renderNotification(
      row({ kind: 'USER_APPROVED', payload: { display_name: 'Jamie Lee' }, recipients: ['jamie@example.com'] }),
      opts
    )!
    expect(m.subject).toBe('Your Highland Cal account has been approved!')
    expect(m.to).toBe('jamie@example.com')
  })

  it('ignores unknown kinds instead of sending something odd', () => {
    expect(renderNotification(row({ kind: 'SOMETHING_ELSE' as never }), opts)).toBeNull()
  })
})

describe('formatTime', () => {
  it.each([
    ['15:00:00', '15:00'],
    ['15:00', '15:00'],
    ['15:00:30', '15:00:30'],
    [null, null],
    ['', null],
  ])('%s -> %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected)
  })
})
