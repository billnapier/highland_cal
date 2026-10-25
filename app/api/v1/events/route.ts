import type { NextRequest } from 'next/server'
import { authenticateRequest, requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import * as core from '@/lib/core/events'
import { CoreError } from '@/lib/core/errors'

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

    // Build next_cursor from the last event's start_date
    let nextCursor: string | null = null
    if (hasMore && events.length > 0) {
      nextCursor = events[events.length - 1].start_date
    }

    return jsonResponse(
      { data: events, next_cursor: nextCursor },
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
          return errorResponse(new CoreError('conflict', error.message || 'Idempotency-Key reused with a different request'))
        }
        console.error('Error creating event (idempotent):', error)
        return errorResponse(new CoreError('internal', 'Failed to create event'))
      }

      // api_create_event() returns { status, replayed, response }; the spec's
      // 201 body is the Event object itself (replayed or not — same shape).
      return jsonResponse(data.response, data.status, identity.rate_limit)
    }

    // No idempotency key-> regular insert through core
    const event = await core.createEvent(client, identity.user_id, body)
    return jsonResponse(event, 201, identity.rate_limit)
  } catch (e) {
    return errorResponse(e)
  }
}