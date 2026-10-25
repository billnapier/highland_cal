import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Typed outcomes of `lib/core` operations. Server Actions turn these into
 * `{ success: false, message }`; API routes (Milestone 14 part 4) turn them
 * into HTTP status codes and the standard error envelope.
 *
 * These describe what the *database* decided. Nothing in `lib/core` decides
 * whether a caller is allowed to do something: RLS does.
 */
export type CoreErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'internal'

export class CoreError extends Error {
  readonly code: CoreErrorCode
  readonly details?: unknown

  constructor(code: CoreErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'CoreError'
    this.code = code
    this.details = details
  }
}

export class UnauthorizedError extends CoreError {
  constructor(message = 'Authentication required') {
    super('unauthorized', message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends CoreError {
  constructor(message = 'Forbidden') {
    super('forbidden', message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends CoreError {
  constructor(message = 'Not found') {
    super('not_found', message)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends CoreError {
  constructor(message = 'Invalid data', details?: unknown) {
    super('validation_failed', message, details)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends CoreError {
  constructor(message = 'Conflict') {
    super('conflict', message)
    this.name = 'ConflictError'
  }
}

export function isCoreError(e: unknown): e is CoreError {
  return e instanceof CoreError
}

/**
 * Map a PostgREST error to a typed core error.
 *
 * - `42501` (insufficient_privilege): an RLS `WITH CHECK` or an explicit
 *   privilege check in a SECURITY DEFINER function rejected the caller.
 * - `PT401` / `PT404` / `PT409`: custom SQLSTATEs raised by our functions
 *   (e.g. `authorize_user_deletion()`, `revoke_api_token()`).
 * - `23505` unique_violation, `23503` foreign_key_violation (referenced row
 *   missing), `23514` check_violation, `22P02` invalid text representation
 *   (e.g. a malformed uuid).
 *
 * PT409 messages are passed through to users, so every `RAISE ... USING
 * ERRCODE = 'PT409'` must use a hand-written, user-safe message.
 *
 * The original error is logged by the caller, never returned to the client:
 * DB messages can leak schema details.
 */
export function fromPostgrestError(error: PostgrestError, fallback = 'Database error'): CoreError {
  switch (error.code) {
    case '42501':
      return new ForbiddenError()
    case 'PT401':
      return new UnauthorizedError()
    case 'PT404':
      return new NotFoundError()
    case 'PT409':
    case '23505':
      return new ConflictError(error.code === 'PT409' ? error.message : 'Conflict')
    case '23503':
      return new NotFoundError()
    case '23514':
    case '22P02':
      return new ValidationError()
    default:
      return new CoreError('internal', fallback)
  }
}
