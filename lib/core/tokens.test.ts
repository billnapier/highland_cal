import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createToken, displayPrefix, generateToken, hashToken, listTokens, revokeToken } from './tokens'
import { ForbiddenError, NotFoundError, ValidationError } from './errors'
import { arg, fakeDb } from './test-utils'

describe('generateToken', () => {
  it('is hcal_pat_ + 43 base62 characters', () => {
    for (let i = 0; i < 200; i++) expect(generateToken()).toMatch(/^hcal_pat_[0-9A-Za-z]{43}$/)
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 1000 }, generateToken))
    expect(seen.size).toBe(1000)
  })

  it('uses every base62 character (no truncated alphabet)', () => {
    const chars = new Set(Array.from({ length: 200 }, generateToken).join('').slice(0))
    for (const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') expect(chars.has(c)).toBe(true)
  })
})

describe('hashToken / displayPrefix', () => {
  it('matches the database: encode(sha256(convert_to(raw, UTF8)), hex)', () => {
    const t = 'hcal_pat_abc'
    expect(hashToken(t)).toBe(createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex'))
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('prefix is the first 12 characters', () => {
    expect(displayPrefix('hcal_pat_Ab3xyz')).toBe('hcal_pat_Ab3')
  })
})

describe('createToken', () => {
  const now = new Date('2027-01-01T00:00:00Z')
  const saved = { id: 't1', name: 'Hermes', prefix: 'hcal_pat_xxx', scopes: ['attendance:write'], created_at: now.toISOString(), expires_at: null, last_used_at: null }

  it('stores only the hash and prefix; returns the plaintext once', async () => {
    const { db, log } = fakeDb({ api_tokens: [{ data: saved }] })
    const { token, row } = await createToken(db, 'actor', { name: '  Hermes ', scopes: ['attendance:write', 'attendance:write'], expires_in_days: 90 }, now)

    const insert = arg(log[0], 'insert') as Record<string, unknown>
    expect(insert).toEqual({
      user_id: 'actor',
      name: 'Hermes',
      token_hash: hashToken(token),
      prefix: token.slice(0, 12),
      scopes: ['attendance:write'],
      expires_at: '2027-04-01T00:00:00.000Z',
    })
    expect(JSON.stringify(insert)).not.toContain(token)
    expect(row).toEqual(saved)
  })

  it('never-expiring tokens store expires_at = null', async () => {
    const { db, log } = fakeDb({ api_tokens: [{ data: saved }] })
    await createToken(db, 'actor', { name: 'x', scopes: [], expires_in_days: null }, now)
    expect(arg(log[0], 'insert')).toMatchObject({ expires_at: null })
  })

  it.each([
    [{ name: '', scopes: [], expires_in_days: 30 }],
    [{ name: 'x', scopes: ['events:everything'], expires_in_days: 30 }],
    [{ name: 'x', scopes: [], expires_in_days: 7 }],
    [{ name: 'x'.repeat(101), scopes: [], expires_in_days: 30 }],
  ])('rejects invalid input %j', async (input) => {
    const { db, log } = fakeDb({})
    await expect(createToken(db, 'actor', input)).rejects.toBeInstanceOf(ValidationError)
    expect(log).toHaveLength(0)
  })

  it('admin-scope trigger rejection → ForbiddenError', async () => {
    const { db } = fakeDb({ api_tokens: [{ error: { code: '23514', message: 'Only admins can create tokens with admin scopes' } }] })
    const err = await createToken(db, 'actor', { name: 'x', scopes: ['users:admin'], expires_in_days: 30 }).catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.message).toMatch(/admin scopes/)
  })

  it('never logs the token or its hash on failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, log } = fakeDb({ api_tokens: [{ error: { code: '42501', message: 'rls' } }] })
    await createToken(db, 'actor', { name: 'x', scopes: [], expires_in_days: 30 }).catch(() => {})
    const insert = arg(log[0], 'insert') as { token_hash: string; prefix: string }
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain(insert.token_hash)
    expect(logged).not.toContain(insert.prefix)
    spy.mockRestore()
  })
})

describe('listTokens / revokeToken', () => {
  it('lists unrevoked tokens newest first, never selecting token_hash', async () => {
    const { db, log } = fakeDb({ api_tokens: [{ data: [] }] })
    await listTokens(db)
    expect(String(arg(log[0], 'select'))).not.toContain('token_hash')
    expect(log[0].calls).toContainEqual(['is', 'revoked_at', null])
  })

  it('revoke goes through revoke_api_token(); false → NotFoundError', async () => {
    const ok = fakeDb({ 'rpc:revoke_api_token': [{ data: true }] })
    await revokeToken(ok.db, 't1')
    expect(arg(ok.log[0], 'rpc')).toEqual({ token_id: 't1' })

    const missing = fakeDb({ 'rpc:revoke_api_token': [{ data: false }] })
    await expect(revokeToken(missing.db, 't1')).rejects.toBeInstanceOf(NotFoundError)
  })
})
