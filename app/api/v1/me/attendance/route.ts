import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import { fromPostgrestError } from '@/lib/core/errors'
import { addEventUrl } from '@/lib/core/events'

/**
 * GET /api/v1/me/attendance
 * List the caller's RSVPs across upcoming events, with event details embedded.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 'read')
    const { client, identity } = auth

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const interestLevel = url.searchParams.get('interest_level')

    let query = client
      .from('attendance')
      .select('event_id:game_id, interest_level, attend_day, updated_at, user:profiles!attendance_user_id_fkey(id, display_name, vanity_name), event:games!inner(id, name, type, start_date, is_two_day, start_time, end_time, location, registration_url, created_by, created_at)')
      .eq('user_id', identity.user_id)

    if (from) {
      query = query.gte('event.start_date', from)
    }
    if (interestLevel) {
      query = query.eq('interest_level', interestLevel)
    }

    query = query.order('start_date', { ascending: false, referencedTable: 'event' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await query as unknown as { data: any; error: any }

    if (error) {
      console.error('Error fetching my attendance:', error)
      throw fromPostgrestError(error, 'Failed to fetch attendance')
    }

    const dataWithUrl = (data || []).map((record: any) => {
      if (record.event) {
        record.event = addEventUrl(record.event)
      }
      return record
    })

    return jsonResponse({ data: dataWithUrl }, 200, identity.rate_limit)
  } catch (e) {
    return errorResponse(e)
  }
}