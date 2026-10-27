import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/notifications', () => ({
  kickNotifications: vi.fn(),
  NOTIFY_HEADER: 'x-hcal-notify',
  MAJOR_CHANGE_HEADER: 'x-hcal-major-change',
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { getBaseUrl } from './base-url'
import { addEventUrl, eventUrl } from './events'
import { addProfileUrl, profileUrl } from './users'

function req(headers: Record<string, string>) {
  return { headers: new Headers(headers) }
}

const EID = '11111111-1111-4111-8111-111111111111'
const UID = '22222222-2222-4222-8222-222222222222'

afterEach(() => vi.unstubAllEnvs())

describe('getBaseUrl', () => {
  it('uses x-forwarded-host (Vercel / load balancer) with https', () => {
    expect(getBaseUrl(req({ 'x-forwarded-host': 'club.hankslam-rondo.com' }))).toBe('https://club.hankslam-rondo.com')
  })

  it('prefers x-forwarded-host over the Host header', () => {
    expect(
      getBaseUrl(req({ host: 'internal.example.com', 'x-forwarded-host': 'club.hankslam-rondo.com' })),
    ).toBe('https://club.hankslam-rondo.com')
  })

  it('respects x-forwarded-proto when present', () => {
    expect(getBaseUrl(req({ host: 'club.hankslam-rondo.com', 'x-forwarded-proto': 'https' }))).toBe(
      'https://club.hankslam-rondo.com',
    )
  })

  it('takes the first entry of a comma-separated x-forwarded-proto list', () => {
    expect(getBaseUrl(req({ host: 'club.hankslam-rondo.com', 'x-forwarded-proto': 'https, http' }))).toBe(
      'https://club.hankslam-rondo.com',
    )
  })

  it('uses http for loopback hosts without a forwarded proto', () => {
    expect(getBaseUrl(req({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
    expect(getBaseUrl(req({ host: '127.0.0.1:3000' }))).toBe('http://127.0.0.1:3000')
    expect(getBaseUrl(req({ host: '[::1]:3000' }))).toBe('http://[::1]:3000')
  })

  it('defaults to https for non-loopback hosts without a forwarded proto', () => {
    expect(getBaseUrl(req({ host: 'club.hankslam-rondo.com' }))).toBe('https://club.hankslam-rondo.com')
  })

  it('accepts a bare Headers object', () => {
    expect(getBaseUrl(new Headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
  })

  it('falls back to VERCEL_URL (no protocol) when no request is available', () => {
    vi.stubEnv('VERCEL_URL', 'club-hankslam-rondo.vercel.app')
    expect(getBaseUrl()).toBe('https://club-hankslam-rondo.vercel.app')
  })

  it('falls back to NEXT_PUBLIC_APP_URL, then to localhost', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
    expect(getBaseUrl()).toBe('https://app.example.com')
    vi.unstubAllEnvs()
    expect(getBaseUrl()).toBe('http://localhost:3000')
  })
})

describe('eventUrl / addEventUrl', () => {
  it('builds the event URL from an explicit base URL', () => {
    expect(eventUrl(EID, 'https://club.hankslam-rondo.com')).toBe(`https://club.hankslam-rondo.com/events/${EID}`)
  })

  it('addEventUrl derives the base from the request source', () => {
    expect(addEventUrl({ id: EID }, req({ host: 'localhost:3000' })).url).toBe(`http://localhost:3000/events/${EID}`)
    expect(addEventUrl({ id: EID }, req({ host: 'club.hankslam-rondo.com' })).url).toBe(
      `https://club.hankslam-rondo.com/events/${EID}`,
    )
  })
})

describe('profileUrl / addProfileUrl', () => {
  it('builds the profile URL from an explicit base URL', () => {
    expect(profileUrl('joesmith', UID, 'https://club.hankslam-rondo.com')).toBe(
      'https://club.hankslam-rondo.com/roster/joesmith',
    )
    // Falls back to the UUID when there is no vanity name
    expect(profileUrl(null, UID, 'https://club.hankslam-rondo.com')).toBe(
      `https://club.hankslam-rondo.com/roster/${UID}`,
    )
  })

  it('addProfileUrl derives the base from the request source', () => {
    expect(addProfileUrl({ vanity_name: 'joesmith', id: UID }, req({ host: 'localhost:3000' })).profile_url).toBe(
      'http://localhost:3000/roster/joesmith',
    )
    expect(addProfileUrl({ vanity_name: 'joesmith', id: UID }, req({ host: 'club.hankslam-rondo.com' })).profile_url).toBe(
      'https://club.hankslam-rondo.com/roster/joesmith',
    )
  })
})