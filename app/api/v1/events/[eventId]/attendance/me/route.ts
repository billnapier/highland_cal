import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse, noContentResponse } from '@/lib/api/response'
import * as coreAttendance from '@/lib/core/attendance'
import { NotFoundError, CoreError } from '@/lib/core/errors'

interface RouteParams {
  params: Promise<{ eventId: string }>
}

const ATTENDANCE_SELECT =
  'event_id:game_id, interest_level, attend_day, updated_at, user:profiles!attendance_user_id_fkey(id, display_name, vanity_name)'

/**
 * GET /api/v1/events/{eventId}/attendance/me
 * Get the caller's RSVP for an event.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  let rateLimit: { limit: number; remaining: number; reset: number } | null = null
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'read')
    const { client, identity } = auth
    rateLimit = identity.rate_limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    const { data, error } = await db
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .eq('game_id', eventId)
      .eq('user_id', identity.user_id)
      .maybeSingle()

    if (error) {
      return errorResponse(new CoreError('internal', 'Failed to fetch attendance'), rateLimit)
    }
    if (!data) {
      return errorResponse(new NotFoundError('Attendance not found'), rateLimit)
    }

    return jsonResponse(data, 200, rateLimit)
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}

/**
 * PUT /api/v1/events/{eventId}/attendance/me
 * Set (upsert) the caller's RSVP for an event. Idempotent.
 * Requires role APPROVED/ADMIN and scope attendance:write.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  let rateLimit: { limit: number; remaining: number; reset: number } | null = null
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth
    rateLimit = identity.rate_limit

    const body = await request.json()
    await coreAttendance.setAttendance(client, identity.user_id, eventId, body)

    // lib/core/attendance returns the bare row (game_id, no embedded user);
    // re-fetch through the spec-shaped select so the response matches
    // Attendance (event_id + user + interest_level all required).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any
    const { data, error } = await db
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .eq('game_id', eventId)
      .eq('user_id', identity.user_id)
      .single()
    if (error) {
      console.error('Error re-fetching attendance after upsert:', error)
      return errorResponse(new CoreError('internal', 'Failed to fetch saved attendance'), rateLimit)
    }

    return jsonResponse(data, 200, rateLimit)
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}

/**
 * DELETE /api/v1/events/{eventId}/attendance/me
 * Remove the caller's RSVP for an event.
 * Returns 204 even if there was nothing to remove.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  let rateLimit: { limit: number; remaining: number; reset: number } | null = null
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth
    rateLimit = identity.rate_limit

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
        return errorResponse(new CoreError('forbidden', 'Not authorized to clear RSVP'), rateLimit)
      }
      return errorResponse(new CoreError('internal', 'Failed to clear RSVP'), rateLimit)
    }

    return noContentResponse(rateLimit)
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}