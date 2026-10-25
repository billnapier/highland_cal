import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import { NotFoundError, CoreError } from '@/lib/core/errors'

interface RouteParams {
  params: Promise<{ eventId: string }>
}

/**
 * GET /api/v1/events/{eventId}/attendance
 * Public. Returns attendance entries for this event, with user summaries.
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

    // First verify the event exists
    const { data: event, error: eventError } = await db
      .from('games')
      .select('id')
      .eq('id', eventId)
      .maybeSingle()

    if (eventError) {
      return errorResponse(new CoreError('internal', 'Failed to fetch event'), rateLimit)
    }
    if (!event) {
      return errorResponse(new NotFoundError('Event not found'), rateLimit)
    }

    const { data, error } = await db
      .from('attendance')
      .select(`
        event_id:game_id, interest_level, attend_day, updated_at,
        user:profiles!attendance_user_id_fkey(id, display_name, vanity_name)
      `)
      .eq('game_id', eventId)
      .order('interest_level', { ascending: true })

    if (error) {
      console.error('Error fetching attendance:', error)
      return errorResponse(new CoreError('internal', 'Failed to fetch attendance'), rateLimit)
    }

    return jsonResponse({ data: data || [] }, 200, rateLimit)
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}