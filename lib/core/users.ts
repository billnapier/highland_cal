import type { DbClient } from './client'
import { ConflictError, CoreError, ForbiddenError, NotFoundError, fromPostgrestError } from './errors'
import { kickNotifications } from '@/lib/notifications'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin user-management operations shared by Server Actions and the Agent API.
 * RLS on `db` ("Only admins can update roles", which also requires the
 * `users:admin` scope for tokens) is the authority; nothing here checks roles.
 */

type Role = 'PENDING' | 'APPROVED' | 'ADMIN'

/** A role UPDATE matched no rows: the user doesn't exist, or RLS hid the write. */
async function deniedOrMissing(db: DbClient, userId: string): Promise<CoreError> {
  // user_roles is publicly readable, so a visible row means the write was denied.
  const { data, error } = await db.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
  if (error) return fromPostgrestError(error, 'Failed to update user')
  return data ? new ForbiddenError('Not authorized') : new NotFoundError('User not found')
}

async function setRole(db: DbClient, userId: string, role: Role, from?: Role): Promise<void> {
  let query = db.from('user_roles').update({ role }).eq('user_id', userId)
  if (from) query = query.eq('role', from)

  const { data: rows, error } = await query.select('user_id')
  if (error) {
    console.error(`Error setting role ${role}:`, error)
    throw fromPostgrestError(error, 'Failed to update user')
  }
  if (rows && rows.length > 0) return

  if (from) {
    // Distinguish "not in the expected state" from "not allowed / missing".
    const { data } = await db.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
    if (data && data.role !== from) {
      throw new ConflictError(`User is not ${from.toLowerCase()}`)
    }
  }
  throw await deniedOrMissing(db, userId)
}

/** PENDING → APPROVED. The role-change trigger enqueues the "Account Approved" email. */
export async function approveUser(db: DbClient, userId: string): Promise<void> {
  await setRole(db, userId, 'APPROVED', 'PENDING')
  kickNotifications()
}

/** APPROVED → ADMIN. Pending users must be approved first (so they get the approval email). */
export async function promoteToAdmin(db: DbClient, userId: string): Promise<void> {
  await setRole(db, userId, 'ADMIN', 'APPROVED')
}

/**
 * Delete a user's account. The database authorizes first
 * (`authorize_user_deletion()`: caller is an admin with `users:admin`, target
 * exists and isn't the caller). Only then is the service-role client used,
 * because Supabase Auth has no RLS-governed delete. This is one of the two
 * service-role exceptions documented in AGENTS.md.
 */
export async function deleteUser(db: DbClient, userId: string): Promise<void> {
  const { error: authzError } = await db.rpc('authorize_user_deletion', { target: userId })
  if (authzError) {
    console.error('User deletion not authorized:', authzError)
    if (authzError.code === '42501') throw new ForbiddenError('Not authorized to delete this user')
    if (authzError.code === 'PT404') throw new NotFoundError('User not found')
    throw fromPostgrestError(authzError, 'Not authorized to delete this user')
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(userId)
  if (error) {
    console.error('Error deleting user:', error)
    throw new CoreError('internal', 'Failed to delete user')
  }
}
