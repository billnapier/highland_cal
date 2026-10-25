import type { NextRequest } from 'next/server'
import { authenticateRequest, requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import * as coreEvents from '@/lib/core/events'
import { NotFoundError, CoreError } from '@/lib/core/errors'

interface RouteParams {
  params: Promise<{ eventId: string }>
}

/**
 * GET /api/v1/events/{eventId}
 * Public. Get one event, always including its attendance list.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    const auth = await authenticateRequest(request, 'read')
    const { client } = auth
    const identity = auth.kind === 'pat' ? auth.identity : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    const { data, error } = await db
      .from('games')
      .select(`
        *,
        attendance:attendance(
          user_id, interest_level, attend_day, updated_at,
          user:profiles!attendance_user_id_fkey(id, display_name, vanity_name)
        )
      `)
      .eq('id', eventId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching event:', error)
      return errorResponse(new CoreError('internal', 'Failed to fetch event'))
    }
    if (!data) {
      return errorResponse(new NotFoundError('Event not found'))
    }

    return jsonResponse(data, 200, identity?.rate_limit ?? null)
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * PATCH /api/v1/events/{eventId}
 * Update an event. Requires scope events:write.
 * ADMIN may edit any event; APPROVED may edit only events they created.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth

    const body = await request.json()
    const event = await coreEvents.updateEvent(client, eventId, body, {
      majorChange: body.major_change === true,
    })

    return jsonResponse(event, 200, identity.rate_limit)
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * DELETE /api/v1/events/{eventId}
 * Delete an event. ADMIN only; requires scope events:delete.
 * Supports ?notify=false to suppress the cancellation emai.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    const auth = await requireAuth(request,'write')
    const { client,identity } = auth

    const url = new URL(request.url)
    const notify = url.searchParams.get('notify')  !== 'false'

    await coreEvents.deleteEvent(client, eventId, { notify })

    return new Response(null, { status: 204 })
  } catch (e) {
    return errorResponse(e)
  }
}