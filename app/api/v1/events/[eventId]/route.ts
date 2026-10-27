import type { NextRequest } from 'next/server'
import { authenticateRequest, requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse, noContentResponse } from '@/lib/api/response'
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
  let rateLimit: { limit: number; remaining: number; reset: number } | null = null
  try {
    const { eventId } = await params
    const auth = await authenticateRequest(request, 'read')
    const { client } = auth
    rateLimit = auth.kind === 'pat' ? auth.identity.rate_limit : auth.rate_limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    const { data, error } = await db
      .from('games')
      .select(`
        *,
        attendance:attendance(
          event_id:game_id, interest_level, attend_day, updated_at,
          user:profiles!attendance_user_id_fkey(id, display_name, vanity_name)
        )
      `)
      .eq('id', eventId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching event:', error)
      return errorResponse(new CoreError('internal', 'Failed to fetch event'), rateLimit)
    }
    if (!data) {
      return errorResponse(new NotFoundError('Event not found'), rateLimit)
    }

// Compute attendance_summary from the attendance records
    const attendance: Array<{ interest_level: string }> = data.attendance || []
    const attendanceSummary = {
      REGISTERED: 0,
      INTERESTED: 0,
      WATCHING: 0,
      NOT_GOING: 0,
    }
    for (const a of attendance) {
      const key = a.interest_level as keyof typeof attendanceSummary
      if (key in attendanceSummary) attendanceSummary[key]++
    }

    return jsonResponse(
      { ...coreEvents.addEventUrl(data, request), attendance_summary: attendanceSummary },
      200,
      rateLimit,
    )
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}

/**
 * PATCH /api/v1/events/{eventId}
 * Update an event. Requires scope events:write.
 * ADMIN may edit any event; APPROVED may edit only events they created.
 *
 * The spec (`EventUpdate`) is a partial update: only supplied fields change.
 * `lib/core/events.updateEvent()` is shared with the full-form UI and expects
 * a complete event payload, so we merge the patch onto the current row
 * (visible via the public read policy) before calling it.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  let rateLimit: { limit: number; remaining: number; reset: number } | null = null
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth
    rateLimit = identity.rate_limit

    const patch = await request.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any
    const { data: current, error: fetchError } = await db
      .from('games')
      .select(coreEvents.EVENT_COLUMNS)
      .eq('id', eventId)
      .maybeSingle()
    if (fetchError) {
      console.error('Error fetching event for patch:', fetchError)
      return errorResponse(new CoreError('internal', 'Failed to update event'), rateLimit)
    }
    if (!current) return errorResponse(new NotFoundError('Event not found'), rateLimit)

    // eventSchema's optional string fields reject `null` (only `undefined`
    // passes `.optional()`), but the DB stores unset values as null. Drop
    // null fields from the current row before merging so an unset column
    // doesn't fail validation when the patch doesn't touch it.
    const currentDefined = Object.fromEntries(
      Object.entries(current).filter(([, v]) => v !== null),
    )
    const merged = { ...currentDefined, ...patch }
    // The spec allows null in the patch body to explicitly clear an optional
    // field (e.g. `location: null`), but eventSchema's `.optional()` fields
    // only accept `undefined`, not `null` — convert after merging.
    for (const key of ['start_time', 'end_time', 'location', 'registration_url'] as const) {
      if (merged[key] === null) merged[key] = undefined
    }
    const event = await coreEvents.updateEvent(client, eventId, merged, {
      majorChange: patch.major_change === true,
      expectedRow: current,
    })

    return jsonResponse(
      { ...coreEvents.addEventUrl(event, request), attendance_summary: { REGISTERED: 0, INTERESTED: 0, WATCHING: 0, NOT_GOING: 0 } },
      200,
      rateLimit,
    )
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}

/**
 * DELETE /api/v1/events/{eventId}
 * Delete an event. ADMIN only; requires scope events:delete.
 * Supports ?notify=false to suppress the cancellation emai.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  let rateLimit: { limit: number; remaining: number; reset: number } | null = null
  try {
    const { eventId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth
    rateLimit = identity.rate_limit

    const url = new URL(request.url)
    const notify = url.searchParams.get('notify') !== 'false'

    await coreEvents.deleteEvent(client, eventId, { notify })

    return noContentResponse(rateLimit)
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}