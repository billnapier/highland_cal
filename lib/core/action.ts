import type { DbClient } from './client'
import { UnauthorizedError, isCoreError } from './errors'

/** Helpers for Server Actions that wrap `lib/core` operations. */

/** The signed-in user's id from the cookie session, or UnauthorizedError. */
export async function sessionActorId(db: DbClient): Promise<string> {
  const {
    data: { user },
  } = await db.auth.getUser()
  if (!user) throw new UnauthorizedError('Unauthorized')
  return user.id
}

/**
 * The user-facing message for a failed action. Core errors carry messages
 * written for users; anything else is unexpected and gets a generic message
 * (the details are logged, not shown).
 */
export function actionErrorMessage(error: unknown): string {
  if (isCoreError(error)) return error.message
  console.error('Unexpected error in server action:', error)
  return 'An unexpected error occurred'
}
