/**
 * E2E test harness for the Highland Cal live-preview API.
 *
 * Reads target URL and role tokens from env vars; provides fetch wrappers,
 * schema-assertion helpers, and a namespacing helper for unique test data.
 *
 * Fails loudly (process.exit) if any required env var is missing.
 */

import { randomBytes } from 'node:crypto'

/* ------------------------------------------------------------------ */
/*  Env vars                                                          */
/* ------------------------------------------------------------------ */

interface E2EConfig {
  baseUrl: string
  runId: string
  tokens: {
    PENDING: string
    APPROVED: string
    ADMIN: string
  }
}

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val || !val.trim()) {
    console.error(`\n  MISSING ENV: ${name} is required but not set.`)
    console.error(`  Set it before running, e.g.:`)
    console.error(`    HCAL_BASE_URL=<preview-url> E2E_TOKEN_*=<token> VERCEL_PROTECTION_BYPASS=<secret> npm run test:api\\n`)
    process.exit(1)
  }
  return val.trim()
}

function loadConfig(): E2EConfig {
  const baseUrl = requireEnv('HCAL_BASE_URL')
  // Normalise: strip trailing slash + /api/v1 if accidentally appended
  const normalized = baseUrl
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/, '')

  const config: E2EConfig = {
    baseUrl: `${normalized}/api/v1`,
    runId: process.env['RUN_ID'] || `local-${randomBytes(4).toString('hex')}`,
    tokens: {
      PENDING: requireEnv('E2E_TOKEN_PENDING'),
      APPROVED: requireEnv('E2E_TOKEN_APPROVED'),
      ADMIN: requireEnv('E2E_TOKEN_ADMIN'),
    },
  }
  return config
}

/** Singleton config — loaded once at module import. */
export const e2eConfig: E2EConfig = loadConfig()

/**
 * Vercel preview protection bypass secret, if set.
 * Preview deployments are behind Vercel Authentication; pass the bypass
 * secret as `x-vercel-protection-bypass` on every request.
 */
const vercelBypass = process.env['VERCEL_PROTECTION_BYPASS']?.trim() || ''

/* ------------------------------------------------------------------ */
/*  Namespacing helper                                                */
/* ------------------------------------------------------------------ */

/**
 * Prefix a label with the run ID so test data is unique per run.
 *
 *   ns('My Event')  →  'CI-a1b2c3d4-My Event'
 */
export function ns(label: string): string {
  return `CI-${e2eConfig.runId}-${label}`
}

/* ------------------------------------------------------------------ */
/*  Fetch wrappers                                                    */
/* ------------------------------------------------------------------ */

interface FetchOptions {
  /** Bearer token. Omit or empty for unauthenticated requests. */
  token?: string
  /** JSON body for POST/PATCH. */
  body?: unknown
  /** Additional headers merged over defaults. */
  headers?: Record<string, string>
  /** AbortSignal for timeouts. */
  signal?: AbortSignal
}

async function request(
  method: string,
  path: string,
  opts: FetchOptions = {},
): Promise<Response> {
  const url = `${e2eConfig.baseUrl}${path.startsWith('/') ? path : '/' + path}`
  const headers: Record<string, string> = {
    ...(opts.headers ?? {}),
  }
  // Vercel preview protection bypass (set VERCEL_PROTECTION_BYPASS env)
  if (vercelBypass) {
    headers['x-vercel-protection-bypass'] = vercelBypass
  }
  if (opts.token) {
    headers['Authorization'] = `Bearer ${opts.token}`
  }
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })
  return res
}

/** GET request. */
export function apiGet(path: string, opts?: FetchOptions): Promise<Response> {
  return request('GET', path, opts)
}

/** POST request. */
export function apiPost(path: string, opts?: FetchOptions): Promise<Response> {
  return request('POST', path, opts)
}

/** PATCH request. */
export function apiPatch(path: string, opts?: FetchOptions): Promise<Response> {
  return request('PATCH', path, opts)
}

/** DELETE request. */
export function apiDelete(path: string, opts?: FetchOptions): Promise<Response> {
  return request('DELETE', path, opts)
}

/* ------------------------------------------------------------------ */
/*  Schema assertion helpers                                          */
/* ------------------------------------------------------------------ */

/**
 * Check that a response has the expected status and that its body matches
 * the Error schema from the spec. Returns the parsed body.
 *
 * The Error schema is:
 *   { error: { code: <enum>, message: string, details?: [...] } }
 */
export async function expectError(res: Response, status: number, expectedCode?: string): Promise<{ error: { code: string; message: string; details?: unknown[] } }> {
  const body: unknown = await res.json()
  const obj = body as Record<string, unknown>
  if (!obj || typeof obj !== 'object') {
    throw new Error(`Expected JSON object, got ${JSON.stringify(body).slice(0, 80)}`)
  }
  const err = obj['error'] as Record<string, unknown> | undefined
  if (!err || typeof err.code !== 'string') {
    throw new Error(`Expected { error: { code, message } }, got ${JSON.stringify(body).slice(0, 120)}`)
  }
  if (res.status !== status) {
    throw new Error(`Expected status ${status}, got ${res.status}. Body: ${JSON.stringify(body).slice(0, 200)}`)
  }
  if (expectedCode !== undefined && err.code !== expectedCode) {
    throw new Error(`Expected error code "${expectedCode}", got "${err.code}". Body: ${JSON.stringify(body).slice(0, 200)}`)
  }
  return obj as { error: { code: string; message: string; details?: unknown[] } }
}

/**
 * Parse the JSON body and verify the response has the expected status.
 * Returns the parsed body (untyped — the caller narrows).
 */
export async function expectOk<T>(res: Response, status = 200): Promise<T> {
  if (res.status !== status) {
    const body = await res.text().catch(() => '<no body>')
    throw new Error(`Expected status ${status}, got ${res.status}. Body: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

/**
 * Return the value of a rate-limit header, or null if absent.
 */
export function rateLimitHeader(res: Response, name: 'RateLimit-Limit' | 'RateLimit-Remaining' | 'RateLimit-Reset'): string | null {
  return res.headers.get(name)
}