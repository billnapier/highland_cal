import { createHash, randomBytes } from 'node:crypto'
import * as z from 'zod'
import type { DbClient } from './client'
import { ForbiddenError, NotFoundError, ValidationError, fromPostgrestError } from './errors'

/**
 * Personal Access Tokens (Detailed_Design §4.7).
 *
 * Creation is session-only, enforced by RLS ("Users can create their own
 * tokens from a session") and by the absence of an API endpoint. Admin-only
 * scopes on a non-admin's token are rejected by the enforce_api_token_scopes
 * trigger. The plaintext is returned exactly once; only its SHA-256 is stored.
 */

export const TOKEN_PREFIX = 'hcal_pat_'
const TOKEN_BODY_LENGTH = 43
const DISPLAY_PREFIX_LENGTH = 12
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export const SCOPES = ['attendance:write', 'events:write', 'events:delete', 'users:admin'] as const
export type Scope = (typeof SCOPES)[number]
/** Effective only when the owner is an ADMIN; offered in the UI only to admins. */
export const ADMIN_SCOPES: readonly Scope[] = ['events:delete', 'users:admin']

export const EXPIRY_DAYS = [30, 90, 365] as const

export const createTokenSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  scopes: z.array(z.enum(SCOPES)).max(SCOPES.length).transform((s) => [...new Set(s)]),
  /** Days until expiry; `null` = never. */
  expires_in_days: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
})
export type CreateTokenInput = z.input<typeof createTokenSchema>

export interface TokenRow {
  id: string
  name: string
  prefix: string
  scopes: Scope[]
  created_at: string
  expires_at: string | null
  last_used_at: string | null
}

const TOKEN_COLUMNS = 'id, name, prefix, scopes, created_at, expires_at, last_used_at'

/** `hcal_pat_` + 43 base62 chars (~256 bits), unbiased via rejection sampling. */
export function generateToken(): string {
  let body = ''
  while (body.length < TOKEN_BODY_LENGTH) {
    for (const byte of randomBytes(64)) {
      // 248 = 62 * 4: discard bytes that would bias the distribution.
      if (byte < 248) body += BASE62[byte % 62]
      if (body.length === TOKEN_BODY_LENGTH) break
    }
  }
  return TOKEN_PREFIX + body
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function displayPrefix(token: string): string {
  return token.slice(0, DISPLAY_PREFIX_LENGTH)
}

export async function createToken(
  db: DbClient,
  actorId: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<{ token: string; row: TokenRow }> {
  const parsed = createTokenSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError('Invalid data', parsed.error.flatten())
  }
  const { name, scopes, expires_in_days } = parsed.data

  const token = generateToken()
  const expires_at =
    expires_in_days === null ? null : new Date(now.getTime() + expires_in_days * 86_400_000).toISOString()

  const { data, error } = await db
    .from('api_tokens')
    .insert({
      user_id: actorId,
      name,
      token_hash: hashToken(token),
      prefix: displayPrefix(token),
      scopes,
      expires_at,
    })
    .select(TOKEN_COLUMNS)
    .single()

  if (error) {
    // Never log the token or its hash.
    console.error('Error creating API token:', { code: error.code, message: error.message })
    if (error.code === '23514' && /admin scopes/i.test(error.message)) {
      throw new ForbiddenError('Only admins can create tokens with admin scopes')
    }
    if (error.code === '42501') {
      throw new ForbiddenError('Tokens can only be created from a signed-in browser session')
    }
    throw fromPostgrestError(error, 'Failed to create token')
  }
  return { token, row: data as TokenRow }
}

/** The caller's live (unrevoked) tokens, newest first. RLS limits rows to the owner. */
export async function listTokens(db: DbClient): Promise<TokenRow[]> {
  const { data, error } = await db
    .from('api_tokens')
    .select(TOKEN_COLUMNS)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Error listing API tokens:', error)
    throw fromPostgrestError(error, 'Failed to list tokens')
  }
  return (data ?? []) as TokenRow[]
}

/** Irreversibly revoke one of the caller's tokens. */
export async function revokeToken(db: DbClient, tokenId: string): Promise<void> {
  const { data, error } = await db.rpc('revoke_api_token', { token_id: tokenId })
  if (error) {
    console.error('Error revoking API token:', error)
    throw fromPostgrestError(error, 'Failed to revoke token')
  }
  if (data !== true) throw new NotFoundError('Token not found')
}
