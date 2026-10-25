import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/notifications', () => ({ kickNotifications: vi.fn() }))
const deleteAuthUser = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { deleteUser: deleteAuthUser } } }),
}))

import { kickNotifications } from '@/lib/notifications'
import { setAttendance } from './attendance'
import { approveUser, deleteUser, promoteToAdmin } from './users'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './errors'
import { arg, fakeDb } from './test-utils'

const kick = vi.mocked(kickNotifications)
const UID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  kick.mockClear()
  deleteAuthUser.mockReset()
})

describe('setAttendance', () => {
  it('upserts with user_id from the actor, not the input', async () => {
    const saved = { user_id: 'actor', game_id: 'g1', interest_level: 'REGISTERED', attend_day: 'BOTH' }
    const { db, log } = fakeDb({ attendance: [{ data: saved }] })
    await expect(
      setAttendance(db, 'actor', 'g1', { interest_level: 'REGISTERED', attend_day: 'BOTH', user_id: 'someone-else' }),
    ).resolves.toEqual(saved)
    expect(arg(log[0], 'upsert')).toEqual({ user_id: 'actor', game_id: 'g1', interest_level: 'REGISTERED', attend_day: 'BOTH' })
  })

  it('defaults attend_day to null', async () => {
    const { db, log } = fakeDb({ attendance: [{ data: {} }] })
    await setAttendance(db, 'actor', 'g1', { interest_level: 'WATCHING' })
    expect(arg(log[0], 'upsert')).toMatchObject({ attend_day: null })
  })

  it('rejects an unknown interest level', async () => {
    const { db } = fakeDb({})
    await expect(setAttendance(db, 'actor', 'g1', { interest_level: 'MAYBE' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('RLS rejection keeps the existing UI message', async () => {
    const { db } = fakeDb({ attendance: [{ error: { code: '42501', message: 'rls' } }] })
    const err = await setAttendance(db, 'actor', 'g1', { interest_level: 'WATCHING' }).catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.message).toBe('Forbidden: You do not have permission to RSVP')
  })

  it('unknown event (FK violation) → NotFoundError("Event not found")', async () => {
    const { db } = fakeDb({ attendance: [{ error: { code: '23503', message: 'fk' } }] })
    const err = await setAttendance(db, 'actor', 'nope', { interest_level: 'WATCHING' }).catch((e) => e)
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err.message).toBe('Event not found')
  })
})

describe('approveUser', () => {
  it('updates only a PENDING row and kicks the approval email', async () => {
    const { db, log } = fakeDb({ user_roles: [{ data: [{ user_id: UID }] }] })
    await approveUser(db, UID)
    expect(arg(log[0], 'update')).toEqual({ role: 'APPROVED' })
    expect(log[0].calls.filter((c) => c[0] === 'eq')).toEqual([['eq', 'user_id', UID], ['eq', 'role', 'PENDING']])
    expect(kick).toHaveBeenCalledOnce()
  })

  it('already approved → ConflictError, no email', async () => {
    const { db } = fakeDb({ user_roles: [{ data: [] }, { data: { role: 'APPROVED' } }] })
    await expect(approveUser(db, UID)).rejects.toBeInstanceOf(ConflictError)
    expect(kick).not.toHaveBeenCalled()
  })

  it('non-admin (RLS hides the update; row still PENDING) → ForbiddenError', async () => {
    const { db } = fakeDb({ user_roles: [{ data: [] }, { data: { role: 'PENDING' } }, { data: { role: 'PENDING' } }] })
    await expect(approveUser(db, UID)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('missing user → NotFoundError', async () => {
    const { db } = fakeDb({ user_roles: [{ data: [] }, { data: null }, { data: null }] })
    await expect(approveUser(db, UID)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('promoteToAdmin', () => {
  it('updates only an APPROVED row and sends no email', async () => {
    const { db, log } = fakeDb({ user_roles: [{ data: [{ user_id: UID }] }] })
    await promoteToAdmin(db, UID)
    expect(arg(log[0], 'update')).toEqual({ role: 'ADMIN' })
    expect(log[0].calls.filter((c) => c[0] === 'eq')).toEqual([['eq', 'user_id', UID], ['eq', 'role', 'APPROVED']])
    expect(kick).not.toHaveBeenCalled()
  })

  it('a PENDING user cannot skip approval → ConflictError', async () => {
    const { db } = fakeDb({ user_roles: [{ data: [] }, { data: { role: 'PENDING' } }] })
    const err = await promoteToAdmin(db, UID).catch((e) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.message).toBe('User is not approved')
  })
})

describe('deleteUser', () => {
  it('asks the database first, then deletes the auth user', async () => {
    const { db, log } = fakeDb({ 'rpc:authorize_user_deletion': [{ data: null }] })
    deleteAuthUser.mockResolvedValue({ error: null })
    await deleteUser(db, UID)
    expect(arg(log[0], 'rpc')).toEqual({ target: UID })
    expect(deleteAuthUser).toHaveBeenCalledWith(UID)
  })

  it('never touches the service-role client when the database refuses', async () => {
    for (const [code, type] of [
      ['42501', ForbiddenError],
      ['PT404', NotFoundError],
      ['PT409', ConflictError],
    ] as const) {
      const { db } = fakeDb({ 'rpc:authorize_user_deletion': [{ error: { code, message: 'You cannot delete your own account' } }] })
      await expect(deleteUser(db, UID)).rejects.toBeInstanceOf(type)
    }
    expect(deleteAuthUser).not.toHaveBeenCalled()
  })
})
