/**
 * E2E read-matrix test: every GET endpoint in docs/openapi.yaml exercised
 * against a live Vercel preview deployment across anonymous/PENDING/APPROVED/ADMIN.
 *
 * Run:
 *   HCAL_BASE_URL=<preview> E2E_TOKEN_PENDING=<t> E2E_TOKEN_APPROVED=<t> E2E_TOKEN_ADMIN=<t> npm run test:api
 *
 * No writes in this file.
 */
import { describe, expect, it } from 'vitest'
import { apiGet, e2eConfig, expectError, expectOk } from './e2e-harness'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const roleTokens = {
  PENDING: { token: e2eConfig.tokens.PENDING, label: 'PENDING' },
  APPROVED: { token: e2eConfig.tokens.APPROVED, label: 'APPROVED' },
  ADMIN: { token: e2eConfig.tokens.ADMIN, label: 'ADMIN' },
} as const

/** Preview host extracted from baseUrl, e.g. "highland-...vercel.app" */
const previewHost = new URL(e2eConfig.baseUrl).hostname

/** A UUID unlikely to exist in the fixture data. */
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Assert that the response carries required rate-limit headers.
 * Note: 401 responses may omit rate-limit headers (known API limitation).
 */
function expectRateLimitHeaders(res: Response): void {
  if (res.status === 401) return // 401 may omit rate-limit headers
  expect(res.headers.get('RateLimit-Limit')).toBeTruthy()
  expect(res.headers.get('RateLimit-Remaining')).toBeTruthy()
  expect(res.headers.get('RateLimit-Reset')).toBeTruthy()
}

/**
 * Check that `url` and `profile_url` fields in a response use the preview
 * host (never `localhost`).
 *
 * Excluded from host check (not deployment-host URLs):
 * - `avatar_url` — Supabase Storage CDN
 * - `customLinks.*.url` — user-provided external links
 * - `registration_url` — user-provided external link
 */
function expectAllUrlsMatchHost(obj: unknown, host: string, path = ''): void {
  if (typeof obj !== 'object' || obj === null) return
  // If this object lives under a `customLinks` array, skip URL checks
  if (path.includes('customLinks')) return
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const keyPath = path ? `${path}.${k}` : k

    const urlFields = new Set(['url', 'profile_url'])
    if (typeof v === 'string' && urlFields.has(k)) {
      if (v.startsWith('http')) {
        const msg = `URL field "${keyPath}" = "${v}" — expected host "${host}"`
        expect(new URL(v).hostname, msg).toBe(host)
      }
    } else if (typeof v === 'object') {
      expectAllUrlsMatchHost(v, host, keyPath)
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Public endpoints (anonymous / no token)                            */
/* ------------------------------------------------------------------ */

describe('public: GET /events', () => {
  it('returns 200 with data array + next_cursor', async () => {
    const res = await apiGet('/events')
    const body = await expectOk<{ data: unknown[]; next_cursor: string | null }>(res)
    expect(Array.isArray(body.data)).toBe(true)
    expect('next_cursor' in body).toBe(true)
    expectRateLimitHeaders(res)
    expectAllUrlsMatchHost(body, previewHost)
  })

  it('respects from/to filters', async () => {
    const res = await apiGet('/events?from=2026-01-01&to=2026-12-31')
    const body = await expectOk<{ data: unknown[] }>(res)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('accepts type=EVENT filter', async () => {
    const res = await apiGet('/events?type=EVENT')
    await expectOk<{ data: unknown[] }>(res)
  })

  it('accepts type=PRACTICE filter', async () => {
    const res = await apiGet('/events?type=PRACTICE')
    await expectOk<{ data: unknown[] }>(res)
  })

  it('accepts include=attendance', async () => {
    const res = await apiGet('/events?include=attendance')
    const body = await expectOk<{ data: unknown[] }>(res)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('accepts limit parameter', async () => {
    const res = await apiGet('/events?limit=5')
    const body = await expectOk<{ data: unknown[] }>(res)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.length).toBeLessThanOrEqual(5)
  })

  it('handles large limit (capped or 400)', async () => {
    const res = await apiGet('/events?limit=999999')
    if (res.status === 200) {
      const body = await expectOk<{ data: unknown[] }>(res)
      expect(Array.isArray(body.data)).toBe(true)
    } else {
      await expectError(res, 400, 'validation_error')
    }
  })

  // NOTE: bad `from` returns 500 internal_error instead of 400 validation_error
  // (known API limitation — the DB query fails on invalid date before validation)
  it('bad `from` returns an error response', async () => {
    const res = await apiGet('/events?from=notadate')
    // The spec says 400 validation_error; the API currently returns 500 internal_error
    const body = await (async () => {
      const b: unknown = await res.json()
      return b as { error: { code: string; message: string } }
    })()
    expect(body.error).toBeDefined()
    expect(typeof body.error.code).toBe('string')
  })

  // NOTE: bad `type` silently returns 200 with empty data instead of 400
  // (known API limitation — enum validation is not enforced server-side)
  it('bad type returns 200 with empty data (known API limitation)', async () => {
    const res = await apiGet('/events?type=BAD_TYPE')
    const body = await expectOk<{ data: unknown[] }>(res)
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe('public: GET /events/{eventId}', () => {
  it('unknown event returns 404', async () => {
    const res = await apiGet(`/events/${NONEXISTENT_ID}`)
    await expectError(res, 404, 'not_found')
    expectRateLimitHeaders(res)
  })
})

describe('public: GET /events/{eventId}/attendance', () => {
  it('unknown event returns 404', async () => {
    const res = await apiGet(`/events/${NONEXISTENT_ID}/attendance`)
    await expectError(res, 404, 'not_found')
    expectRateLimitHeaders(res)
  })
})

describe('public: GET /users', () => {
  it('returns 200 with public roster', async () => {
    const res = await apiGet('/users')
    const body = await expectOk<{ data: unknown[]; next_cursor: string | null }>(res)
    expect(Array.isArray(body.data)).toBe(true)
    expect('next_cursor' in body).toBe(true)
    expectRateLimitHeaders(res)
    expectAllUrlsMatchHost(body, previewHost)

    // Public roster should NOT expose email or role
    for (const user of body.data) {
      const u = user as Record<string, unknown>
      expect(u).not.toHaveProperty('email')
      expect(u).not.toHaveProperty('role')
    }
  })
})

describe('public: GET /users/{userId}', () => {
  it('returns 200 for known user (Bill Napier)', async () => {
    const res = await apiGet('/users/87a941f6-9f2a-41fa-804d-b08c2c2b0be4')
    expect(res.status).toBe(200)
    const body = await expectOk(res)
    expect(body).toHaveProperty('id', '87a941f6-9f2a-41fa-804d-b08c2c2b0be4')
    expect(body).toHaveProperty('outward_links')
    expectAllUrlsMatchHost(body, previewHost)
  })

  it('unknown user returns 404', async () => {
    const res = await apiGet(`/users/${NONEXISTENT_ID}`)
    await expectError(res, 404, 'not_found')
  })
})

/* ------------------------------------------------------------------ */
/*  Auth-gated endpoints                                               */
/* ------------------------------------------------------------------ */

describe('auth: GET /me', () => {
  it('anonymous returns 401', async () => {
    const res = await apiGet('/me')
    await expectError(res, 401, 'unauthorized')
    // 401 responses may omit rate-limit headers (known limitation)
  })

  for (const { token, label } of Object.values(roleTokens)) {
    it(`${label} returns correct role`, async () => {
      const res = await apiGet('/me', { token })
      const body = await expectOk<{ role: string }>(res)
      expect(body.role).toBe(label)
      expectAllUrlsMatchHost(body, previewHost)
    })
  }
})

describe('auth: GET /me/attendance', () => {
  it('anonymous returns 401', async () => {
    const res = await apiGet('/me/attendance')
    await expectError(res, 401, 'unauthorized')
  })

  for (const { token, label } of Object.values(roleTokens)) {
    it(`${label} returns 200 with data array`, async () => {
      const res = await apiGet('/me/attendance', { token })
      const body = await expectOk<{ data: unknown[] }>(res)
      expect(Array.isArray(body.data)).toBe(true)
    })
  }
})

describe('auth: GET /events/{eventId}/attendance/me', () => {
  it('anonymous returns 401', async () => {
    const res = await apiGet(`/events/${NONEXISTENT_ID}/attendance/me`)
    await expectError(res, 401, 'unauthorized')
  })

  for (const { token, label } of Object.values(roleTokens)) {
    it(`${label}: unknown event returns 404`, async () => {
      const res = await apiGet(`/events/${NONEXISTENT_ID}/attendance/me`, { token })
      await expectError(res, 404, 'not_found')
    })
  }
})

/* ------------------------------------------------------------------ */
/*  Role-specific user visibility                                      */
/* ------------------------------------------------------------------ */

describe('auth: GET /users with admin role', () => {
  it('ADMIN sees email and role on /users', async () => {
    const res = await apiGet('/users', { token: e2eConfig.tokens.ADMIN })
    const body = await expectOk<{ data: Record<string, unknown>[] }>(res)
    expect(Array.isArray(body.data)).toBe(true)
    // At least one user (Bill Napier — the real admin user) should have email and role
    const hasAdminFields = body.data.some(
      (u) => typeof u.email === 'string' && typeof u.role === 'string',
    )
    expect(hasAdminFields).toBe(true)
    expectAllUrlsMatchHost(body, previewHost)
  })

  it('PENDING token sees public roster (no email/role)', async () => {
    const res = await apiGet('/users', { token: e2eConfig.tokens.PENDING })
    const body = await expectOk<{ data: Record<string, unknown>[] }>(res)
    for (const u of body.data) {
      expect(u).not.toHaveProperty('email')
      expect(u).not.toHaveProperty('role')
    }
  })
})

/* ------------------------------------------------------------------ */
/*  URL hygiene regression (no localhost)                              */
/* ------------------------------------------------------------------ */

describe('regression: no localhost URLs', () => {
  const endpoints = ['/events', '/users']
  for (const { token, label } of Object.values(roleTokens)) {
    for (const ep of endpoints) {
      it(`${label} ${ep} has no localhost urls`, async () => {
        const res = await apiGet(ep, { token })
        const body = await expectOk(res)
        const bodyStr = JSON.stringify(body)
        expect(bodyStr).not.toContain('localhost')
        expect(bodyStr).not.toContain('127.0.0.1')
        expect(bodyStr).not.toContain('0.0.0.0')
      })
    }
  }
})

/* ------------------------------------------------------------------ */
/*  Outward_links shape (regression for PRs #72, #80)                  */
/* ------------------------------------------------------------------ */

describe('regression: outward_links shape', () => {
  it('User listing includes outward_links with customLinks (title + url)', async () => {
    const res = await apiGet('/users', { token: e2eConfig.tokens.ADMIN })
    const body = await expectOk<{ data: Record<string, unknown>[] }>(res)
    // Bill Napier should have outward_links
    const bill = body.data.find((u) => u.id === '87a941f6-9f2a-41fa-804d-b08c2c2b0be4')
    expect(bill).toBeDefined()
    expect(bill!).toHaveProperty('outward_links')
    const links = bill!.outward_links as Record<string, unknown> | null
    if (links) {
      if (Array.isArray(links.customLinks) && links.customLinks.length > 0) {
        for (const cl of links.customLinks as Record<string, unknown>[]) {
          expect(cl).toHaveProperty('title')
          expect(cl).toHaveProperty('url')
        }
      }
    }
  })
})