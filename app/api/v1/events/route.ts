import type { NextRequest } from 'next/server'
import { authenticateRequest, requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import * as core from '@/lib/core/events'
import { CoreError, IdempotencyConflictError } from '@/lib/core/errors'

/** Interest-level labels used in attendance_summary. */
const INTEREST_LEVELS = ['REGISTERED', 'INTERESTED', 'WATCHING', 'NOT_GOING'] as const

/**
 * GET /api/v1/events
 * Public. Returns events sorted by start_date ascending.
 * Supports from, to, type, include=attendance, limit, cursor.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, 'read')
    const { client } = auth
    const identity = auth.kind === 'pat' ? auth.identity : null

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const type = url.searchParams.get('type')
    const include = url.searchParams.get('include')
    const limitParam = url.searchParams.get('limit')
    const cursor = url.searchParams.get('cursor')
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 200)

    // Build the select query
    let selectFields = core.EVENT_COLUMNS
    if (include === 'attendance') {
      selectFields += ', attendance:attendance(user_id, interest_level, attend_day, updated_at)'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    let query = db
      .from('games')
      .select(selectFields)
      .order('start_date', { ascending: true })
      .limit(limit + 1) // Fetch one extra to determine if there's a next page

    // Default "from" to yesterday
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    query = query.gte('start_date', from || yesterday)

    if (to) query = query.lte('start_date', to)
    if (type) query = query.eq('type', type)
    if (cursor) query = query.gt('start_date', cursor)

    const { data: rows, error } = await query

    if (error) {
      console.error('Error listing events:', error)
      return errorResponse(new CoreError('internal', 'Failed to list events'))
    }

    const items = rows || []
    const hasMore = items.length > limit
    const events = hasMore ? items.slice(0, limit) : items

    // Batch-fetch attendance counts for every returned event
    const eventIds = events.map((e: { id: string }) => e.id)
    const { data: attendanceRows } = eventIds.length > 0
      ? await db.from('attendance').select('event_id, interest_level').in('event_id', eventIds)
      : { data: [] }
    const countsByEvent: Record<string, Record<string, number>> = {}
    for (const a of (attendanceRows || []) as Array<{ event_id: string; interest_level: string }>) {
      if (!countsByEvent[a.event_id]) {
        countsByEvent[a.event_id] = { REGISTERED: 0, INTERESTED: 0, WATCHING: 0, NOT_GOING: 0 }
      }
      const key = a.interest_level
      if (INTEREST_LEVELS.includes(key as typeof INTEREST_LEVELS[number])) {
        countsByEvent[a.event_id][key]++
      }
    }
    const eventsWithSummary = events.map((e: Record<string, unknown>) => ({
      ...e,
      attendance_summary: countsByEvent[e.id as string] || { REGISTERED: 0, INTERESTED: 0, WATCHING: 0, NOT_GOING: 0 },
    }))

    // Build next_cursor from the last event's start_date
    let nextCursor: string | null = null
    if (hasMore && eventsWithSummary.length > 0) {
      nextCursor = eventsWithSummary[eventsWithSummary.length - 1].start_date as string
    }

    return jsonResponse(
      { data: eventsWithSummary, next_cursor: nextCursor },
      200,
      identity?.rate_limit ?? null,
    )
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * POST /api/v1/events
 * Create an event. Requires role APPROVED or ADMIN and scope events:write.
 * Supports Idempotency-Key header for safe retries.
 * With an idempotency Key,uses api_create_event() RPC (atomic). * Without,goes through lib/core/events createEvent()
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request,'write')
    const { client,identity } = auth

    const idempotencyKey = request.headers.get('Idempotency-Key')
    const body = await request.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    if (idempotencyKey) {
      // Use the atomic idempotent RPC
      const encoder = new TextEncoder()
      const hashInput = ['POST','/events', JSON.stringify(body)].join('|')
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(hashInput))
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const requestHash = hashArray.map(b => b.toString(16).padStart(2,'0')).join('')

      const { data, error } = await db.rpc('api_create_event', {
        payload: body,
        idem_key: idempotencyKey,
        request_hash: requestHash,
      })

      if (error) {
        if (error.code === 'PT409') {
          return errorResponse(new IdempotencyConflictError(error.message || 'Idempotency-Key reused with a different request'))
        }
        console.error('Error creating event (idempotent):', error)
        return errorResponse(new CoreError('internal', 'Failed to create event'))
      }

      // api_create_event() returns { status, replayed, response }; the spec's
      // 201 body is the Event object itself (replayed or not — same shape).
      return jsonResponse(
        { ...data.response, attendance_summary: { REGISTERED: 0, INTERESTED: 0, WATCHING: 0, NOT_GOING: 0 } },
        data.status,
        identity.rate_limit,
      )
    }

    // No idempotency key-> regular insert through core
    const event = await core.createEvent(client, identity.user_id, body)
    return jsonResponse(
      { ...event, attendance_summary: { REGISTERED: 0, INTERESTED: 0, WATCHING: 0, NOT_GOING: 0 } },
      201,
      identity.rate_limit,
    )
  } catch (e) {
    return errorResponse(e)
  }
}