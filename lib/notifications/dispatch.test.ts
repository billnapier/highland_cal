import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchNotifications, type SendEmail } from './dispatch'
import type { ClaimedNotification } from './render'

// Fake service-role client: claim_notifications hands out queued rows one at a
// time; every RPC call is recorded so tests can assert how outcomes were settled.
function fakeSupabase(
  queue: ClaimedNotification[],
  opts: { claimError?: string; settleResult?: boolean } = {}
) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args })
    if (fn === 'claim_notifications') {
      if (opts.claimError) return { data: null, error: { message: opts.claimError } }
      return { data: queue.splice(0, Number(args.batch)), error: null }
    }
    return { data: opts.settleResult ?? true, error: null }
  })
  return { client: { rpc } as unknown as SupabaseClient, calls }
}

const event = (id: string, recipients = ['a@example.com']): ClaimedNotification => ({
  id,
  claim_token: `tok-${id}`,
  kind: 'EVENT_CREATED',
  subject_id: null,
  payload: { name: `Event ${id}`, start_date: '2027-01-01', type: 'EVENT' },
  attempts: 1,
  recipients,
})

const base = { from: 'club@example.com', appUrl: 'https://club.example' }
const settled = (calls: { fn: string; args: Record<string, unknown> }[], fn: string) =>
  calls.filter((c) => c.fn === fn).map((c) => c.args)

describe('dispatchNotifications', () => {
  it('claims one row at a time, immediately before sending it', async () => {
    const { client, calls } = fakeSupabase([event('n1'), event('n2')])
    const send = vi.fn<SendEmail>(async () => ({ error: null }))

    await dispatchNotifications({ ...base, supabase: client, send })

    expect(calls.map((c) => c.fn)).toEqual([
      'claim_notifications', 'complete_notification',
      'claim_notifications', 'complete_notification',
      'claim_notifications',
    ])
    expect(calls.filter((c) => c.fn === 'claim_notifications').every((c) => c.args.batch === 1)).toBe(true)
  })

  it('sends with the outbox id as the idempotency key and settles with the lease token', async () => {
    const { client, calls } = fakeSupabase([event('n1'), event('n2')])
    const send = vi.fn<SendEmail>(async () => ({ error: null }))

    const r = await dispatchNotifications({ ...base, supabase: client, send })

    expect(r).toEqual({ sent: 2, failed: 0, skipped: 0 })
    expect(send.mock.calls[0][1]).toBe('n1')
    expect(send.mock.calls[0][0]).toMatchObject({ from: 'club@example.com', subject: 'New Event: Event n1' })
    expect(settled(calls, 'complete_notification')).toEqual([
      { notification_id: 'n1', token: 'tok-n1', error: null, uncertain: false },
      { notification_id: 'n2', token: 'tok-n2', error: null, uncertain: false },
    ])
  })

  it('records failed sends so the row is retried; thrown/uncertain errors are flagged uncertain', async () => {
    const { client, calls } = fakeSupabase([event('n1'), event('n2'), event('n3')])
    const send = vi
      .fn<SendEmail>()
      .mockResolvedValueOnce({ error: 'rate_limit_exceeded: slow down' })
      .mockResolvedValueOnce({ error: 'internal_server_error: boom', uncertain: true })
      .mockRejectedValueOnce(new Error('network down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const r = await dispatchNotifications({ ...base, supabase: client, send })

    expect(r).toEqual({ sent: 0, failed: 3, skipped: 0 })
    expect(settled(calls, 'complete_notification')).toEqual([
      { notification_id: 'n1', token: 'tok-n1', error: 'rate_limit_exceeded: slow down', uncertain: false },
      { notification_id: 'n2', token: 'tok-n2', error: 'internal_server_error: boom', uncertain: true },
      { notification_id: 'n3', token: 'tok-n3', error: 'network down', uncertain: true },
    ])
    err.mockRestore()
  })

  it('with email disabled, marks rows handled without sending (same as the old stubs)', async () => {
    const { client, calls } = fakeSupabase([event('n1')])

    const r = await dispatchNotifications({ ...base, supabase: client, send: null })

    expect(r).toEqual({ sent: 0, failed: 0, skipped: 1 })
    expect(settled(calls, 'skip_notification')).toEqual([
      { notification_id: 'n1', token: 'tok-n1', reason: 'email disabled' },
    ])
  })

  it('skips rows with no recipients', async () => {
    const { client, calls } = fakeSupabase([event('n1', [])])
    const send = vi.fn<SendEmail>(async () => ({ error: null }))

    const r = await dispatchNotifications({ ...base, supabase: client, send })

    expect(send).not.toHaveBeenCalled()
    expect(r.skipped).toBe(1)
    expect(settled(calls, 'skip_notification')).toEqual([
      { notification_id: 'n1', token: 'tok-n1', reason: 'no recipients' },
    ])
  })

  it('warns (does not throw) when a settlement is rejected as stale', async () => {
    const { client } = fakeSupabase([event('n1')], { settleResult: false })
    const send = vi.fn<SendEmail>(async () => ({ error: null }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await dispatchNotifications({ ...base, supabase: client, send })

    expect(warn).toHaveBeenCalledWith('complete_notification: stale lease, outcome ignored', { id: 'n1' })
    warn.mockRestore()
  })

  it('is bounded by maxNotifications', async () => {
    const { client, calls } = fakeSupabase([event('n1'), event('n2'), event('n3'), event('n4')])
    const send = vi.fn<SendEmail>(async () => ({ error: null }))

    const r = await dispatchNotifications({ ...base, supabase: client, send, maxNotifications: 3 })

    expect(r.sent).toBe(3)
    expect(calls.filter((c) => c.fn === 'claim_notifications')).toHaveLength(3)
  })

  it('surfaces a claim failure', async () => {
    const { client } = fakeSupabase([], { claimError: 'permission denied' })
    await expect(dispatchNotifications({ ...base, supabase: client, send: null })).rejects.toThrow(
      'claim_notifications failed: permission denied'
    )
  })
})
