import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runDispatcher } from '@/lib/notifications'

// Daily Vercel Cron fallback (vercel.json): drains anything the per-request
// after() kick missed (crash, timeout, Resend outage). Vercel sends
// `Authorization: Bearer $CRON_SECRET`.
export const dynamic = 'force-dynamic'

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Unauthorized' } }, { status: 401 })
  }
  try {
    const result = await runDispatcher()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Cron notification dispatch failed', error)
    return NextResponse.json({ error: { code: 'internal', message: 'Dispatch failed' } }, { status: 500 })
  }
}
