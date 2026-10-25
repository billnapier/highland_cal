import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  kickNotifications: vi.fn(),
  NOTIFY_HEADER: 'x-hcal-notify',
  MAJOR_CHANGE_HEADER: 'x-hcal-major-change',
}))

import { kickNotifications } from '@/lib/notifications'
import { createEvent, deleteEvent, updateEvent } from './events'
import { ForbiddenError, NotFoundError, ValidationError } from './errors'
import { arg, fakeDb, methods } from './test-utils'

const kick = vi.mocked(kickNotifications)
const EID = '11111111-1111-4111-8111-111111111111'
const valid = { name: 'Spring Open', start_date: '2027-04-10', is_two_day: false, type: 'EVENT' as const }
const row = { id: EID, ...valid }

beforeEach(() => kick.mockClear())

describe('createEvent', () => {
  it('inserts with created_by = actor, normalizes blanks to null, and kicks the outbox', async () => {
    const { db, log } = fakeDb({ games: [{ data: row }] })
    await expect(createEvent(db, 'actor', { ...valid, location: '', registration_url: '' })).resolves.toEqual(row)

    const insert = arg(log[0], 'insert') as Record<string, unknown>
    expect(insert).toMatchObject({ name: 'Spring Open', created_by: 'actor', location: null, registration_url: null, start_time: null })
    expect(log[0].headers).toEqual({})
    expect(kick).toHaveBeenCalledOnce()
  })

  it('notify: false sets x-hcal-notify=false and does not kick', async () => {
    const { db, log } = fakeDb({ games: [{ data: row }] })
    await createEvent(db, 'actor', valid, { notify: false })
    expect(log[0].headers).toEqual({ 'x-hcal-notify': 'false' })
    expect(kick).not.toHaveBeenCalled()
  })

  it('rejects invalid input before touching the database', async () => {
    const { db, log } = fakeDb({})
    await expect(createEvent(db, 'actor', { ...valid, type: 'PRACTICE' })).rejects.toBeInstanceOf(ValidationError)
    expect(log).toHaveLength(0)
  })

  it('maps an RLS rejection (42501) to ForbiddenError with the UI message', async () => {
    const { db } = fakeDb({ games: [{ error: { code: '42501', message: 'new row violates row-level security policy' } }] })
    const err = await createEvent(db, 'actor', valid).catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.message).toBe('Forbidden: You do not have permission to create events')
    expect(kick).not.toHaveBeenCalled()
  })

  it('hides unexpected database messages', async () => {
    const { db } = fakeDb({ games: [{ error: { code: 'XX000', message: 'relation "secret_internal" ...' } }] })
    const err = await createEvent(db, 'actor', valid).catch((e) => e)
    expect(err.message).toBe('Failed to create event. Please try again later.')
  })
})

describe('updateEvent', () => {
  it('returns the updated row; major change sets the header and kicks', async () => {
    const { db, log } = fakeDb({ games: [{ data: [row] }] })
    await expect(updateEvent(db, EID, valid, { majorChange: true })).resolves.toEqual(row)
    expect(methods(log[0])).toEqual(['update', 'eq', 'select'])
    expect(arg(log[0], 'update')).not.toHaveProperty('created_by')
    expect(log[0].headers).toEqual({ 'x-hcal-major-change': 'true' })
    expect(kick).toHaveBeenCalledOnce()
  })

  it('minor change sends no header and does not kick', async () => {
    const { db, log } = fakeDb({ games: [{ data: [row] }] })
    await updateEvent(db, EID, valid)
    expect(log[0].headers).toEqual({})
    expect(kick).not.toHaveBeenCalled()
  })

  it('0 rows + row visible → ForbiddenError (RLS filtered the update)', async () => {
    const { db } = fakeDb({ games: [{ data: [] }, { data: { id: EID } }] })
    const err = await updateEvent(db, EID, valid, { majorChange: true }).catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(kick).not.toHaveBeenCalled()
  })

  it('0 rows + row not visible → NotFoundError', async () => {
    const { db } = fakeDb({ games: [{ data: [] }, { data: null }] })
    await expect(updateEvent(db, EID, valid)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('deleteEvent', () => {
  it('deletes, selects affected ids, and kicks', async () => {
    const { db, log } = fakeDb({ games: [{ data: [{ id: EID }] }] })
    await deleteEvent(db, EID)
    expect(methods(log[0])).toEqual(['delete', 'eq', 'select'])
    expect(kick).toHaveBeenCalledOnce()
  })

  it('notify: false suppresses the email', async () => {
    const { db, log } = fakeDb({ games: [{ data: [{ id: EID }] }] })
    await deleteEvent(db, EID, { notify: false })
    expect(log[0].headers).toEqual({ 'x-hcal-notify': 'false' })
    expect(kick).not.toHaveBeenCalled()
  })

  it('non-admin (0 rows, row visible) gets the existing UI message', async () => {
    const { db } = fakeDb({ games: [{ data: [] }, { data: { id: EID } }] })
    const err = await deleteEvent(db, EID).catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.message).toBe('Forbidden: Only admins can delete events')
  })
})
