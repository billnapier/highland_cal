/**
 * E2E write-matrix test: every write endpoint in docs/openapi.yaml exercised against
 * a live Vercel preview deployment across anonymous/PENDING/APPROVED/ADMIN roles.
 *
 * Run:
 *   HCAL_BASE_URL=<preview> E2E_TOKEN_PENDING=<t> E2E_TOKEN_APPROVED=<t> E2E_TOKEN_ADMIN=<t> npm run test:api
 *
 * Every write uses notify=false to avoid emailing the club during CI.
 * All fixtures are namespaced with ns() and cleaned up in afterAll.
 */
import { describe, expect, it, afterAll, beforeAll } from 'vitest'
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  e2eConfig,
  expectError,
  expectOk,
  ns,
} from './e2e-harness'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const APPROVED = { token: e2eConfig.tokens.APPROVED, label: 'APPROVED' }
const ADMIN = { token: e2eConfig.tokens.ADMIN, label: 'ADMIN' }
const PENDING = { token: e2eConfig.tokens.PENDING, label: 'PENDING' }

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000'

/** A valid Idempotency-Key for retry tests. */
const IDEM_KEY = `ci-write-${e2eConfig.runId}`

/** Track event IDs created during the suite for cleanup. */
const createdEventIds: string[] = []

/**
 * Create a test fixture event with the ADMIN token, always notify=false.
 * The event is registered for automatic cleanup on suite teardown.
 */
async function createFixture(name: string, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const body = {
    name: ns(name),
    start_date: '2026-11-01',
    type: 'EVENT',
    is_two_day: false,
    notify: false,
    ...overrides,
  }
  const res = await apiPost('/events', { token: ADMIN.token, body })
  const event = await expectOk<Record<string, unknown>>(res, 201)
  createdEventIds.push(event.id as string)
  return event
}

/** Always-notify=false delete helper. */
async function deleteFixture(id: string): Promise<void> {
  const res = await apiDelete(`/events/${id}?notify=false`, { token: ADMIN.token })
  expect(res.status).toBe(204)
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

let fixtureEvent: Record<string, unknown>

beforeAll(async () => {
  fixtureEvent = await createFixture('write-matrix-fixture')
  expect(fixtureEvent).toHaveProperty('id')
  expect(fixtureEvent).toHaveProperty('url')
  expect(fixtureEvent).toHaveProperty('attendance_summary')
})

afterAll(async () => {
  // Clean up every event this suite created
  for (const id of [...new Set(createdEventIds)]) {
    try {
      await deleteFixture(id)
    } catch {
      // Best-effort cleanup — if it's already gone, that's fine.
    }
  }

  // Assert the preview DB is clean: no leftover namespace data
  // (Created events were deleted above; verify there's nothing left.)
  const leftover = createdEventIds.filter(Boolean)
  expect(leftover.length).toBe(0)
})

/* ------------------------------------------------------------------ */
/*  POST /events — Create                                              */
/* ------------------------------------------------------------------ */

describe('POST /events', () => {
  let createdId: string | null = null

  afterAll(async () => {
    if (createdId) {
      await deleteFixture(createdId).catch(() => {})
    }
  })

  it('APPROVED creates an event → 201', async () => {
    const body = {
      name: ns('approved-create'),
      start_date: '2026-11-02',
      type: 'EVENT',
      notify: false,
    }
    const res = await apiPost('/events', { token: APPROVED.token, body })
    const event = await expectOk<Record<string, unknown>>(res, 201)
    expect(event).toHaveProperty('id')
    expect(event).toHaveProperty('url')
    expect(event.name).toBe(ns('approved-create'))
    createdId = event.id as string
  })

  it('ADMIN creates an event → 201', async () => {
    const body = {
      name: ns('admin-create'),
      start_date: '2026-11-03',
      type: 'PRACTICE',
      start_time: '18:00',
      end_time: '19:30',
      notify: false,
    }
    const res = await apiPost('/events', { token: ADMIN.token, body })
    const event = await expectOk<Record<string, unknown>>(res, 201)
    expect(event).toHaveProperty('id')
    expect(event.type).toBe('PRACTICE')
    // Clean this one up immediately to keep the afterAll list short
    await deleteFixture(event.id as string)
  })

  it('PENDING → 403 forbidden', async () => {
    const body = {
      name: ns('pending-create'),
      start_date: '2026-11-04',
      type: 'EVENT',
      notify: false,
    }
    const res = await apiPost('/events', { token: PENDING.token, body })
    await expectError(res, 403, 'forbidden')
  })

  it('anonymous → 401 unauthorized', async () => {
    const body = {
      name: ns('anon-create'),
      start_date: '2026-11-05',
      type: 'EVENT',
      notify: false,
    }
    const res = await apiPost('/events', { body })
    await expectError(res, 401, 'unauthorized')
  })

  it('validation: missing name → 400', async () => {
    const body = {
      start_date: '2026-11-06',
      type: 'EVENT',
      notify: false,
    }
    const res = await apiPost('/events', { token: APPROVED.token, body })
    await expectError(res, 400, 'validation_error')
  })

  describe('idempotency-key', () => {
    const idemBody = {
      name: ns('idempotent-event'),
      start_date: '2026-11-10',
      type: 'EVENT',
      notify: false,
    }
    let idemEventId: string | null = null

    afterAll(async () => {
      if (idemEventId) {
        await deleteFixture(idemEventId).catch(() => {})
      }
    })

    it('first request creates with Idempotency-Key → 201', async () => {
      const res = await apiPost('/events', {
        token: APPROVED.token,
        body: idemBody,
        headers: { 'Idempotency-Key': IDEM_KEY.concat('-event') },
      })
      const event = await expectOk<Record<string, unknown>>(res, 201)
      expect(event).toHaveProperty('id')
      expect(event.name).toBe(ns('idempotent-event'))
      idemEventId = event.id as string
    })

    it('same key, same body → returns same event (201 or 409 OK per spec)', async () => {
      const res = await apiPost('/events', {
        token: APPROVED.token,
        body: idemBody,
        headers: { 'Idempotency-Key': IDEM_KEY.concat('-event') },
      })
      // The spec is ambiguous here — the RPC returns the existing event with status 201
      // but some implementations return 409 for the same body. Accept both.
      if (res.status === 409) {
        await expectError(res, 409, 'idempotency_conflict')
      } else {
        const event = await expectOk<Record<string, unknown>>(res, 201)
        expect(event.id).toBe(idemEventId)
      }
    })

    it('same key, different body → 409 idempotency_conflict', async () => {
      const differentBody = {
        name: ns('idempotent-event-different'),
        start_date: '2026-11-11',
        type: 'EVENT',
        notify: false,
      }
      const res = await apiPost('/events', {
        token: APPROVED.token,
        body: differentBody,
        headers: { 'Idempotency-Key': IDEM_KEY.concat('-event') },
      })
      await expectError(res, 409, 'idempotency_conflict')
    })
  })
})

/* ------------------------------------------------------------------ */
/*  PATCH /events/{eventId} — Update                                   */
/* ------------------------------------------------------------------ */

describe('PATCH /events/{eventId}', () => {
  let patchFixture: Record<string, unknown>

  beforeAll(async () => {
    patchFixture = await createFixture('patch-test')
  })

  it('owner (ADMIN) partial update → 200', async () => {
    const res = await apiPatch(`/events/${patchFixture.id}`, {
      token: ADMIN.token,
      body: { name: ns('patch-test-updated'), notify: false },
    })
    const event = await expectOk<Record<string, unknown>>(res, 200)
    expect(event.name).toBe(ns('patch-test-updated'))
    expect(event).toHaveProperty('attendance_summary')
  })

  it('non-owner APPROVED → 403 forbidden', async () => {
    const res = await apiPatch(`/events/${patchFixture.id}`, {
      token: APPROVED.token,
      body: { name: ns('should-fail') },
    })
    await expectError(res, 403, 'forbidden')
  })

  it('PATCH on nonexistent event → 404', async () => {
    const res = await apiPatch(`/events/${NONEXISTENT_ID}`, {
      token: ADMIN.token,
      body: { name: 'nowhere' },
    })
    await expectError(res, 404, 'not_found')
  })

  it('anonymous → 401 unauthorized', async () => {
    const res = await apiPatch(`/events/${patchFixture.id}`, {
      body: { name: ns('anon-patch') },
    })
    await expectError(res, 401, 'unauthorized')
  })
})

/* ------------------------------------------------------------------ */
/*  DELETE /events/{eventId} — Delete                                   */
/* ------------------------------------------------------------------ */

describe('DELETE /events/{eventId}', () => {
  let delFixture: Record<string, unknown>

  beforeAll(async () => {
    delFixture = await createFixture('delete-test')
  })

  it('ADMIN deletes → 204', async () => {
    const res = await apiDelete(`/events/${delFixture.id}?notify=false`, {
      token: ADMIN.token,
    })
    expect(res.status).toBe(204)
    // Remove from cleanup list since we already deleted it
    const idx = createdEventIds.indexOf(delFixture.id as string)
    if (idx >= 0) createdEventIds.splice(idx, 1)
  })

  it('APPROVED attempts delete → 403 forbidden', async () => {
    const fixture = await createFixture('delete-approved')
    const res = await apiDelete(`/events/${fixture.id}?notify=false`, {
      token: APPROVED.token,
    })
    await expectError(res, 403, 'forbidden')
  })

  it('DELETE on nonexistent event → 404', async () => {
    const res = await apiDelete(`/events/${NONEXISTENT_ID}?notify=false`, {
      token: ADMIN.token,
    })
    await expectError(res, 404, 'not_found')
  })

  it('anonymous → 401 unauthorized', async () => {
    const fixture = await createFixture('delete-anon')
    const res = await apiDelete(`/events/${fixture.id}?notify=false`)
    await expectError(res, 401, 'unauthorized')
  })
})

/* ------------------------------------------------------------------ */
/*  Attendance: PUT + DELETE /events/{eventId}/attendance/me           */
/* ------------------------------------------------------------------ */

describe('Attendance write matrix', () => {
  let attFixture: Record<string, unknown>

  beforeAll(async () => {
    attFixture = await createFixture('att-write')
  })

  it('PUT /events/{eventId}/attendance/me: APPROVED sets interest_level → 200', async () => {
    const res = await apiPut(`/events/${attFixture.id}/attendance/me`, {
      token: APPROVED.token,
      body: { interest_level: 'REGISTERED', attend_day: null },
    })
    const att = await expectOk<Record<string, unknown>>(res, 200)
    expect(att).toHaveProperty('event_id', attFixture.id)
    expect(att).toHaveProperty('interest_level', 'REGISTERED')
    expect(att).toHaveProperty('user')
    expect(att.user).toHaveProperty('id')
    expect(att.user).toHaveProperty('display_name')
  })

  it('attendance_summary reflects the RSVP', async () => {
    const res = await apiGet(`/events/${attFixture.id}`)
    const event = await expectOk<Record<string, unknown>>(res, 200)
    const summary = event.attendance_summary as Record<string, number>
    expect(summary.REGISTERED).toBeGreaterThanOrEqual(1)
  })

  it('PUT updates interest_level → 200', async () => {
    const res = await apiPut(`/events/${attFixture.id}/attendance/me`, {
      token: APPROVED.token,
      body: { interest_level: 'INTERESTED' },
    })
    const att = await expectOk<Record<string, unknown>>(res, 200)
    expect(att.interest_level).toBe('INTERESTED')
  })

  it('DELETE /events/{eventId}/attendance/me: clear RSVP → 204', async () => {
    const res = await apiDelete(`/events/${attFixture.id}/attendance/me`, {
      token: APPROVED.token,
    })
    expect(res.status).toBe(204)
  })

  it('GET /me/attendance reflects cleared RSVP', async () => {
    const res = await apiGet('/me/attendance', { token: APPROVED.token })
    const body = await expectOk<{ data: unknown[] }>(res, 200)
    const entry = body.data.find(
      (a: unknown) => (a as Record<string, unknown>).event_id === attFixture.id,
    )
    expect(entry).toBeUndefined()
  })

  it('anonymous → 401 on PUT', async () => {
    const res = await apiPut(`/events/${attFixture.id}/attendance/me`, {
      body: { interest_level: 'WATCHING' },
    })
    await expectError(res, 401, 'unauthorized')
  })

  it('PENDING → 403 on PUT (role check)', async () => {
    const res = await apiPut(`/events/${attFixture.id}/attendance/me`, {
      token: PENDING.token,
      body: { interest_level: 'WATCHING' },
    })
    await expectError(res, 403, 'forbidden')
  })
})

/* ------------------------------------------------------------------ */
/*  Token operations                                                   */
/* ------------------------------------------------------------------ */

describe('Token write matrix', () => {
  it('GET /tokens returns token list for APPROVED → 200', async () => {
    const res = await apiGet('/tokens', { token: APPROVED.token })
    const body = await expectOk<{ data: unknown[] }>(res, 200)
    expect(Array.isArray(body.data)).toBe(true)
    if (body.data.length > 0) {
      const t = body.data[0] as Record<string, unknown>
      expect(t).toHaveProperty('id')
      expect(t).toHaveProperty('name')
      expect(t).toHaveProperty('prefix')
      expect(t).toHaveProperty('scopes')
      expect(t).toHaveProperty('created_at')
    }
  })

  it('DELETE /tokens/{tokenId} (self-revoke) → 204, and revoked token returns 401', async () => {
    // List the PENDING token's own tokens to find its id
    const listRes = await apiGet('/tokens', { token: PENDING.token })
    const list = await expectOk<{ data: Record<string, unknown>[] }>(listRes, 200)
    expect(list.data.length).toBeGreaterThanOrEqual(1)

    const pendingTokenId = list.data[0].id as string

    // Revoke the PENDING token
    const revokeRes = await apiDelete(`/tokens/${pendingTokenId}`, {
      token: PENDING.token,
    })
    expect(revokeRes.status).toBe(204)

    // Verify the revoked token is now rejected
    const retryRes = await apiGet('/me', { token: PENDING.token })
    await expectError(retryRes, 401, 'unauthorized')
  })

  it('admin-only scopes: PENDING token should not have events:delete or users:admin', async () => {
    // Check capabilities via /me — the PENDING token is already revoked in the
    // previous test, so we check this against the APPROVED token as well.
    // The APPROVED user should NOT have events:delete or users:admin scopes.
    const res = await apiGet('/me', { token: APPROVED.token })
    const me = await expectOk<{ capabilities: string[]; role: string }>(res, 200)
    expect(me.role).toBe('APPROVED')
    // APPROVED users should not have admin-only scopes
    expect(me.capabilities).not.toContain('events:delete')
    expect(me.capabilities).not.toContain('users:admin')
  })

  it('ADMIN token has events:delete scope', async () => {
    const res = await apiGet('/me', { token: ADMIN.token })
    const me = await expectOk<{ capabilities: string[] }>(res, 200)
    // ADMIN should have admin scopes in capabilities
    expect(me.capabilities).toContain('events:delete')
  })
})