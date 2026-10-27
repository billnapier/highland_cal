/**
 * E2E smoke test: proves the harness is wired correctly against a live preview.
 *
 * Run:
 *   HCAL_BASE_URL=<preview> E2E_TOKEN_PENDING=<t> E2E_TOKEN_APPROVED=<t> E2E_TOKEN_ADMIN=<t> npm run test:api
 *
 * These tests are deliberately kept to the absolute minimum — the bulk of
 * read- and write-matrix coverage lives in card 2 and card 3 respectively.
 */
import { describe, expect, it } from 'vitest'
import { apiGet, e2eConfig, expectError, expectOk } from './e2e-harness'

/* ------------------------------------------------------------------ */
/*  Unauthenticated smoke tests                                       */
/* ------------------------------------------------------------------ */

describe('unauthenticated public endpoints', () => {
  it('GET /events returns 200 with a data array', async () => {
    const res = await apiGet('/events')
    expect(res.status).toBe(200)

    const body = await expectOk<{ data: unknown[]; next_cursor: string | null }>(res)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty('next_cursor')

    // Rate-limit headers should be present on every response
    expect(res.headers.get('RateLimit-Limit')).toBeTruthy()
    expect(res.headers.get('RateLimit-Remaining')).toBeTruthy()
    expect(res.headers.get('RateLimit-Reset')).toBeTruthy()
  })

  it('GET /me returns 401 with the Error schema', async () => {
    const res = await apiGet('/me')
    await expectError(res, 401, 'unauthorized')
  })
})

/* ------------------------------------------------------------------ */
/*  Token-based smoke test (one per role to prove auth works)         */
/* ------------------------------------------------------------------ */

describe('authenticated /me per role', () => {
  it('PENDING token returns 200 with PENDING role', async () => {
    const res = await apiGet('/me', { token: e2eConfig.tokens.PENDING })
    const body = await expectOk<{ role: string }>(res)
    expect(body.role).toBe('PENDING')
  })

  it('APPROVED token returns 200 with APPROVED role', async () => {
    const res = await apiGet('/me', { token: e2eConfig.tokens.APPROVED })
    const body = await expectOk<{ role: string }>(res)
    expect(body.role).toBe('APPROVED')
  })

  it('ADMIN token returns 200 with ADMIN role', async () => {
    const res = await apiGet('/me', { token: e2eConfig.tokens.ADMIN })
    const body = await expectOk<{ role: string }>(res)
    expect(body.role).toBe('ADMIN')
  })
})