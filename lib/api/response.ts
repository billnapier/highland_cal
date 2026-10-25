import { NextResponse } from 'next/server'
import { isCoreError } from '@/lib/core/errors'
import type { CoreError } from '@/lib/core/errors'

/**
 * Standard error code → HTTP status mapping.
 */
function errorStatus(code: string): number {
  switch (code) {
    case 'unauthorized': return 401
    case 'forbidden': return 403
    case 'not_found': return 404
    case 'validation_failed': return 400
    case 'conflict': return 409
    case 'idempotency_conflict': return 409
    case 'rate_limited': return 429
    default: return 500
  }
}

/**
 * Core error code → API error code string.
 */
function apiCode(code: string): string {
  switch (code) {
    case 'validation_failed': return 'validation_error'
    case 'rate_limited': return 'rate_limited'
    case 'unauthorized': return 'unauthorized'
    case 'forbidden': return 'forbidden'
    case 'not_found': return 'not_found'
    case 'conflict': return 'conflict'
    case 'idempotency_conflict': return 'idempotency_conflict'
    case 'internal': return 'internal_error'
    default: return 'internal_error'
  }
}

/**
 * Convert an error (CoreError or unknown) to a JSON error response.
 * The original PostgREST error is logged by lib/core; this never leaks schema details.
 */
export function errorResponse(
  error: unknown,
  rateLimit?: { limit: number; remaining: number; reset: number } | null,
): NextResponse {
  if (!isCoreError(error)) {
    console.error('Unhandled API error:', error)
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Internal server error' } },
      { status: 500 },
    )
  }

  const code = error.code
  const status = errorStatus(code)
  const body: { error: Record<string, unknown> } = {
    error: {
      code: apiCode(code),
      message: error.message,
    },
  }

  // Include details for validation errors and rate limit errors
  if (error.details && (code === 'validation_failed' || code === 'rate_limited')) {
    body.error.details = error.details
  }

  const headers: Record<string, string> = {}

  // Rate-limit headers
  if (rateLimit) {
    headers['RateLimit-Limit'] = String(rateLimit.limit)
    headers['RateLimit-Remaining'] = String(rateLimit.remaining)
    headers['RateLimit-Reset'] = String(rateLimit.reset)
  }
  if (status === 429 && rateLimit) {
    headers['Retry-After'] = String(Math.max(1, Math.ceil(rateLimit.reset - Date.now() / 1000)))
  }

  return NextResponse.json(body, { status, headers })
}

/**
 * Create a successful JSON response with optional rate-limit headers.
 */
export function jsonResponse(
  data: unknown,
  status = 200,
  rateLimit?: { limit: number; remaining: number; reset: number } | null,
): NextResponse {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (rateLimit) {
    headers['RateLimit-Limit'] = String(rateLimit.limit)
    headers['RateLimit-Remaining'] = String(rateLimit.remaining)
    headers['RateLimit-Reset'] = String(rateLimit.reset)
  }
  return NextResponse.json(data, { status, headers })
}

/**
 * Build the rate-limit header object from the auth identity's rate_limit field.
 */
export function rateLimitHeaders(identity: { rate_limit: { limit: number; remaining: number; reset: number } } | null) {
  return identity?.rate_limit ?? null
}

/**
 * Create a 204 No Content response with optional rate-limit headers.
 */
export function noContentResponse(
  rateLimit?: { limit: number; remaining: number; reset: number } | null,
): NextResponse {
  const headers: Record<string, string> = {}
  if (rateLimit) {
    headers['RateLimit-Limit'] = String(rateLimit.limit)
    headers['RateLimit-Remaining'] = String(rateLimit.remaining)
    headers['RateLimit-Reset'] = String(rateLimit.reset)
  }
  return new NextResponse(null, { status: 204, headers })
}

/**
 * Extract rate-limit info from any auth result (PAT or anonymous).
 */
export function rateLimitFromAuth(
  auth: { kind: string; identity?: { rate_limit?: { limit: number; remaining: number; reset: number } | null }; rate_limit?: { limit: number; remaining: number; reset: number } | null } | null,
): { limit: number; remaining: number; reset: number } | null {
  if (!auth) return null
  if (auth.kind === 'pat' && auth.identity) return auth.identity.rate_limit ?? null
  return auth.rate_limit ?? null
}