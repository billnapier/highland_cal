import { describe, expect, it } from 'vitest'
import { errorResponse, jsonResponse } from './response'
import { CoreError } from '@/lib/core/errors'

async function body(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text())
}

describe('errorResponse', () => {
  it('maps validation_failed to 400 with validation_error code', async () => {
    const err = new CoreError('validation_failed', 'Invalid data', [
      { path: ['start_time'], message: 'Start time is required for practices' },
    ])
    const res = errorResponse(err)
    expect(res.status).toBe(400)
    const b = await body(res)
    expect(b).toMatchObject({
      error: {
        code: 'validation_error',
        message: 'Invalid data',
        details: [{ path: ['start_time'], message: 'Start time is required for practices' }],
      },
    })
  })

  it('maps unauthorized to 401', async () => {
    const err = new CoreError('unauthorized', 'Invalid or revoked token')
    const res = errorResponse(err)
    expect(res.status).toBe(401)
    expect((await body(res)).error).toMatchObject({ code: 'unauthorized' })
  })

  it('maps forbidden to 403', async () => {
    const res = errorResponse(new CoreError('forbidden', 'Only admins can delete events'))
    expect(res.status).toBe(403)
    expect((await body(res)).error).toMatchObject({ code: 'forbidden' })
  })

  it('maps not_found to 404', () => {
    expect(errorResponse(new CoreError('not_found', 'Event not found')).status).toBe(404)
  })

  it('maps conflict to 409', () => {
    expect(errorResponse(new CoreError('conflict', 'User is not pending')).status).toBe(409)
  })

  it('maps rate_limited to 429', () => {
    expect(errorResponse(new CoreError('rate_limited', 'Rate limit exceeded')).status).toBe(429)
  })

  it('includes rate-limit headers when provided', async () => {
    const err = new CoreError('rate_limited', 'Too many requests')
    const res = errorResponse(err, { limit: 60, remaining: 0, reset: 1234567890 })
    expect(res.headers.get('RateLimit-Limit')).toBe('60')
    expect(res.headers.get('RateLimit-Remaining')).toBe('0')
    expect(res.headers.get('RateLimit-Reset')).toBe('1234567890')
    expect(res.headers.get('Retry-After')).toBeDefined()
  })

  it('falls back to 500 for unknown errors', async () => {
    const res = errorResponse(new Error('Boom'))
    expect(res.status).toBe(500)
    const b = await body(res)
    expect((b.error as Record<string, string>).code).toBe('internal_error')
  })
})

describe('jsonResponse', () => {
  it('returns JSON with rate-limit headers', async () => {
    const res = jsonResponse({ data: [1, 2, 3] }, 200, { limit: 300, remaining: 299, reset: 1234567890 })
    expect(res.headers.get('RateLimit-Limit')).toBe('300')
    expect(res.headers.get('RateLimit-Remaining')).toBe('299')
    expect((await body(res)).data).toEqual([1, 2, 3])
  })

  it('sets Content-Type header', () => {
    expect(jsonResponse({ ok: true }).headers.get('Content-Type')).toMatch(/^application\/json/)
  })
})