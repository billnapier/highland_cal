import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchNotifications, type SendEmail } from './dispatch'
import type { ClaimedNotification } from './render'

// Fake service-role client: claim_notifications returns queued batches; every
// RPC call is recorded so tests can assert how outcomes were settled.
function fakeSupabase(batches: ClaimedNotification[][], opts: { claimError?: string } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args })
    if (fn === 'claim_notifications') {
      if (opts.claimError) return { data: null, error: { message: opts.claimError } }
      return { data: batches.shift() ?? [], error: null }
    }
    return { data: null, error: null }
  })
  return { client: { rpc } as unknown as SupabaseClient, calls }
}

const event = (id: string, recipients = ['a@example.com']): ClaimedNotification => ({
  id,
  kind: 'EVENT_CREATED',
  subject_id: null,
  payload: { name: `Event ${id}`, start_date: '2027-01-01', type: 'EVENT' },
  attempts: 1,
  recipients,
})

const base = { from: 'club@example.com', appUrl: 'https://club.example' }

describe('dispatchNotifications', () => {
  it('sends each claimed row with the outbox id as the idempotency key and marks it sent', async () => {
    const { client, calls } = fakeSupabase([[event('n1'), event('n2')]])
    const send = vi.fn<SendEmail>(async () => ({ error: null }))

    const r = await dispatchNotifications({ ...base, supabase: client, send })

    expect(r).toEqual({ sent: 2, failed: 0, skipped: 0 })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][1]).toBe('n1')
    expect(send.mock.calls[0][0]).toMatchObject({ from: 'club@example.com', subject: 'New Event: Event n1' })
    expect(calls.filter((c) => c.fn === 'complete_notification').map((c) => c.args)).toEqual([
      { notification_id: 'n1', error: null },
      { notification_id: 'n2', error: null },
    ])
  })

  it('records a failed send (returned or thrown) so the row is retried', async () => {
    const { client, calls } = fakeSupabase([[event('n1'), event('n2')]])
    const send = vi
      .fn<SendEmail>()
      .mockResolvedValueOnce({ error: 'rate_limit_exceeded: slow down' })
      .mockRejectedValueOnce(new Error('network down'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const r = await dispatchNotifications({ ...base, supabase: client, send })

    expect(r).toEqual({ sent: 0, failed: 2, skipped: 0 })
    expect(calls.filter((c) => c.fn === 'complete_notification').map((c) => c.args)).toEqual([
      { notification_id: 'n1', error: 'rate_limit_exceeded: slow down' },
      { notification_id: 'n2', error: 'network down' },
    ])
    err.mockRestore()
  })

  it('with email disabled, marks rows handled without sending (same as the old stubs)', async () => {
    const { client, calls } = fakeSupabase([[event('n1')]])

    const r = await dispatchNotifications({ ...base, supabase: client, send: null })

    expect(r).toEqual({ sent: 0, failed: 0, skipped: 1 })
    expect(calls).toContainEqual({ fn: 'skip_notification', args: { notification_id: 'n1', reason: 'email disabled' } })
  })

  it('skips rows with no recipients', async () => {
    const { client, calls } = fakeSupabase([[event('n1', [])]])
    const send = vi.fn<SendEmail>(async () => ({ error: null }))

    const r = await dispatchNotifications({ ...base, supabase: client, send })

    expect(send).not.toHaveBeenCalled()
    expect(r.skipped).toBe(1)
    expect(calls).toContainEqual({ fn: 'skip_notification', args: { notification_id: 'n1', reason: 'no recipients' } })
  })

  it('keeps claiming full batches, bounded by maxBatches', async () => {
    const { client, calls } = fakeSupabase([[event('n1')], [event('n2')], [event('n3')], [event('n4')]])
    const send = vi.fn<SendEmail>(async () => ({ error: null }))

    const r = await dispatchNotifications({ ...base, supabase: client, send, batchSize: 1, maxBatches: 3 })

    expect(r.sent).toBe(3)
    expect(calls.filter((c) => c.fn === 'claim_notifications')).toHaveLength(3)
  })

  it('stops after a partial batch', async () => {
    const { client, calls } = fakeSupabase([[event('n1')], [event('n2')]])
    const send = vi.fn<SendEmail>(async () => ({ error: null }))

    await dispatchNotifications({ ...base, supabase: client, send, batchSize: 5 })

    expect(calls.filter((c) => c.fn === 'claim_notifications')).toHaveLength(1)
  })

  it('surfaces a claim failure', async () => {
    const { client } = fakeSupabase([], { claimError: 'permission denied' })
    await expect(dispatchNotifications({ ...base, supabase: client, send: null })).rejects.toThrow(
      'claim_notifications failed: permission denied'
    )
  })
})
