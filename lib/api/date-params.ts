import { ValidationError } from '@/lib/core/errors'

/**
 * Strict YYYY-MM-DD calendar-date check. Accepts only real dates: rejects
 * malformed strings, impossible dates (2026-02-31, 2026-13-01), and anything
 * with a time component. Used for query params declared as `format: date`
 * in the OpenAPI spec (`from`/`to` on GET /events).
 */
export function isValidDateParam(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Validate the date-range query params before they reach the database.
 * An invalid value would otherwise surface as a PostgREST 22P02 (invalid input
 * syntax for type date) and map to a 500. Throws a spec-shaped
 * validation_error instead (400).
 *
 * Empty values are treated as absent (the route falls back to its default).
 */
export function validateDateParams(url: URL): void {
  const invalid = (['from', 'to'] as const).filter((name) => {
    const value = url.searchParams.get(name)
    return value !== null && value !== '' && !isValidDateParam(value)
  })
  if (invalid.length > 0) {
    throw new ValidationError(
      'Invalid request',
      invalid.map((name) => ({
        path: [name],
        message: `Invalid date "${url.searchParams.get(name)}": expected YYYY-MM-DD`,
      })),
    )
  }
}
