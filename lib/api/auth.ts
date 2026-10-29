import { createClient } from '@supabase/supabase-js'
import { fromPostgrestError, CoreError } from '@/lib/core/errors'

/** Hash an IP address for anonymous rate limiting (SHA-256 hex digest). */
async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(ip)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Extract the client IP from request headers.
 * Returns a best-effort value; '0.0.0.0' when no IP is available.
 */
function getClientIP(request: Request): string {
  // Fly.io, Vercel, and most proxies set this
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim())
    return ips[0] || '0.0.0.0'
  }
  // Cloudflare
  const cf = request.headers.get('cf-connecting-ip')
  if (cf) return cf
  // Vercel
  const real = request.headers.get('x-real-ip')
  if (real) return real
  return '0.0.0.0'
}

/**
 * Result of a successful PAT-authenticated request.
 */
export interface PatIdentity {
  kind: 'pat'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
  identity: {
    user_id: string
    role: 'PENDING' | 'APPROVED' | 'ADMIN'
    scopes: string[]
    token_id: string
    rate_limit: {
      limit: number
      remaining: number
      reset: number
    }
  }
}

/**
 * Result of an unauthenticated (public) request.
 */
export interface AnonymousIdentity {
  kind: 'anonymous'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
  rate_limit: {
    limit: number
    remaining: number
    reset: number
  }
}

export type RateLimitInfo = { limit: number; remaining: number; reset: number }

export type RequestIdentity = PatIdentity | AnonymousIdentity

/**
 * Parse the Authorization header from an incoming request.
 * Never logged — the raw header value is discarded after hashing.
 */
function parseBearer(request: Request): string | null {
  const auth = request.headers.get('Authorization')
  if (!auth) return null
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

/**
 * Build an anon-key Supabase client. Never uses the service-role key.
 */
function anonClient(token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers['x-hcal-token'] = token
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )
}

/**
 * Authenticate an API request.
 *
 * 1. Reads `Authorization: Bearer ***`
 * 2. Creates an anon-key Supabase client with `x-hcal-token` header (never service role)
 * 3. Calls `rpc('api_authenticate', { kind })` — the database validates the token,
 *    enforces rate limits, updates last_used_at, and returns the owner's live role & scopes
 * 4. Returns `{ kind: 'pat', client, identity }` or `{ kind: 'anonymous', client }`
 *
 * Errors map to HTTP 401 / 429 via thrown CoreError.
 */
export async function authenticateRequest(
  request: Request,
  kind: 'read' | 'write' = 'read',
): Promise<RequestIdentity> {
  const token = parseBearer(request)
  if (!token) {
    // Anonymous requests: get rate-limit budget for this IP
    const client = anonClient()
    const ipHash = await hashIP(getClientIP(request))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rl } = await (client as any).rpc('api_rate_limit_anonymous', { ip_hash: ipHash })
    const rateLimit = rl as { limit: number; remaining: number; reset: number } | null ?? {
      limit: 120, remaining: 119, reset: Math.floor(Date.now() / 1000) + 60,
    }
    return { kind: 'anonymous', client, rate_limit: rateLimit }
  }

  const client = anonClient(token)

  const { data, error } = await client.rpc('api_authenticate', { kind })

  if (error) {
    if (error.code === 'PT401') {
      throw new CoreError('unauthorized', error.message || 'Invalid or revoked token')
    }
    if (error.code === 'PT429') {
      throw new CoreError('rate_limited', error.message || 'Rate limit exceeded', error.details)
    }
    throw fromPostgrestError(error, 'Authentication failed')
  }

  return {
    kind: 'pat',
    client,
    identity: data as PatIdentity['identity'],
  }
}

/**
 * Require authentication. Shorthand for callers that need a token.
 * Throws CoreError('unauthorized') when the request is anonymous.
 */
export async function requireAuth(
  request: Request,
  kind: 'read' | 'write' = 'read',
): Promise<PatIdentity> {
  const result = await authenticateRequest(request, kind)
  if (result.kind === 'anonymous') {
    const err = new CoreError('unauthorized', 'Authentication required')
    ;(err as CoreError & { rateLimit: RateLimitInfo | null }).rateLimit = result.rate_limit ?? null
    throw err
  }
  return result
}