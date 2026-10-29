import { describe, expect, it } from 'vitest'
import { isValidDateParam, validateDateParams } from './date-params'
import { ValidationError } from '@/lib/core/errors'

function url(query: string): URL {
  return new URL(`https://example.test/api/v1/events?${query}`)
}

describe('isValidDateParam', () => {
  it('accepts real YYYY-MM-DD dates', () => {
    for (const d of ['2026-01-01', '2026-12-31', '2026-01-31', '2024-02-29', '2000-02-29']) {
      expect(isValidDateParam(d), d).toBe(true)
    }
  })

  it('rejects malformed strings', () => {
    for (const d of ['notadate', '2026/01/01', '2026-1-1', '20260101', '26-01-01', '2026-01-01T00:00:00Z', '2026-01-01 00:00']) {
      expect(isValidDateParam(d), d).toBe(false)
    }
  })

  it('rejects impossible calendar dates', () => {
    for (const d of ['2026-13-01', '2026-00-01', '2026-01-32', '2026-02-30', '2025-02-29', '2026-04-31']) {
      expect(isValidDateParam(d), d).toBe(false)
    }
  })
})

describe('validateDateParams', () => {
  it('accepts a valid date range', () => {
    expect(() => validateDateParams(url('from=2026-01-01&to=2026-12-31'))).not.toThrow()
  })

  it('ignores absent and empty params', () => {
    expect(() => validateDateParams(url(''))).not.toThrow()
    expect(() => validateDateParams(url('from=&to='))).not.toThrow()
  })

  it('throws a spec-shaped ValidationError for an invalid from', () => {
    try {
      validateDateParams(url('from=notadate'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      const err = e as ValidationError
      expect(err.code).toBe('validation_failed')
      expect(err.details).toEqual([
        { path: ['from'], message: 'Invalid date "notadate": expected YYYY-MM-DD' },
      ])
    }
  })

  it('reports every invalid param in one response', () => {
    try {
      validateDateParams(url('from=2026-02-31&to=garbage'))
      expect.unreachable('should have thrown')
    } catch (e) {
      const err = e as ValidationError
      expect(err.details).toEqual([
        { path: ['from'], message: 'Invalid date "2026-02-31": expected YYYY-MM-DD' },
        { path: ['to'], message: 'Invalid date "garbage": expected YYYY-MM-DD' },
      ])
    }
  })

  it('round-trips through errorResponse as a 400 validation_error', async () => {
    // integration with the response mapper: ValidationError → 400 validation_error
    const { errorResponse } = await import('./response')
    try {
      validateDateParams(url('from=notadate'))
      expect.unreachable('should have thrown')
    } catch (e) {
      const res = errorResponse(e)
      expect(res.status).toBe(400)
      expect(JSON.parse(await res.text())).toMatchObject({
        error: {
          code: 'validation_error',
          message: 'Invalid request',
          details: [{ path: ['from'], message: 'Invalid date "notadate": expected YYYY-MM-DD' }],
        },
      })
    }
  })
})
