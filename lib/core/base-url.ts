/**
 * Build the site's absolute base URL for links embedded in API responses
 * (`url` on events, `profile_url` on users).
 *
 * Precedence:
 *  1. Request headers — `x-forwarded-host` (set by Vercel and load
 *     balancers), then `Host` — so links reflect the domain the client
 *     actually used: `https://club.hankslam-rondo.com` in production,
 *     `http://localhost:3000` when running locally.
 *  2. `VERCEL_URL` — Vercel's deployment hostname, without a protocol.
 *  3. `NEXT_PUBLIC_APP_URL` — explicit operator-configured base URL.
 *  4. `http://localhost:3000` — last-resort fallback for local dev.
 */

/** A request-like object with headers, or a bare Headers object. */
export type BaseUrlSource = { headers: Headers } | Headers | null | undefined

function isLoopbackHost(host: string): boolean {
  return host.startsWith('localhost') || host.startsWith('127.') || host.startsWith('[::1]')
}

export function getBaseUrl(source?: BaseUrlSource): string {
  const headers = source instanceof Headers ? source : source?.headers

  // The request's host headers are ground truth for how the client reached us.
  const forwardedHost = headers?.get('x-forwarded-host')
  const host = forwardedHost || headers?.get('host')
  if (host) {
    // Proxies may send a comma-separated list ("https, http"); take the first.
    const forwardedProto = headers?.get('x-forwarded-proto')?.split(',')[0]?.trim()
    const protocol = forwardedProto || (isLoopbackHost(host) ? 'http' : 'https')
    return `${protocol}://${host}`
  }

  // No request context: fall back to hosting-provided configuration.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}