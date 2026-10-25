import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import * as coreAttendance from '@/lib/core/attendance'
import { NotFoundError, CoreError } from '@/lib/core/errors'

interface RouteParams {
  params: Promise<{ eventId: string }>
}

/**
 * GET /api/v1/events/{eventId}/attendance/me
 * Get the caller's RSVP for an event.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'read')
    const { client, identity } = auth

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    const { data, error } = await db
      .from('attendance')
      .select('event_id, interest_level, attend_day, updated_at')
      .eq('game_id', eventId)
      .eq('user_id', identity.user_id)
      .maybeSingle()

    if (error) {
      return errorResponse(new CoreError('internal', 'Failed to fetch attendance'))
    }
    if (!data) {
      return errorResponse(new NotFoundError('Attendance not found'))
    }

    return jsonResponse(data, 200, identity.rate_limit)
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * PUT /api/v1/events/{eventId}/attendance/me
 * Set (upsert) the caller's RSVP for an event. Idempotent.
 * Requires role APPROVED/ADMIN and scope attendance:write.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth

    const body = await request.json()
    const result = await coreAttendance.setAttendance(client, identity.user_id, eventId, body)

    return jsonResponse(result, 200, identity.rate_limit)
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * DELETE /api/v1/events/{eventId}/attendance/me
 * Remove the caller's RSVP for an event.
 * Returns 204 even if there was nothing to remove.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    const { error } = await db
      .from('attendance')
      .delete()
      .eq('game_id', eventId)
      .eq('user_id', identity.user_id)

    if (error) {
      console.error('Error deleting attendance:', error)
      // RLS deny -> 403
      if (error.code === '42501') {
        return errorResponse(new CoreError('forbidden', 'Not authorized to clear RSVP'))
      }
      return errorResponse(new CoreError('internal', 'Failed to clear RSVP'))
    }

    return new Response(null, { status: 204 })
  } catch (e) {
    return errorResponse(e)
  }
}