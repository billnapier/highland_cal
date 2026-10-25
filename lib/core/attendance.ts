import * as z from 'zod'
import type { DbClient } from './client'
import { ForbiddenError, ValidationError, fromPostgrestError } from './errors'

/** RSVP operations shared by Server Actions and the Agent API. RLS authorizes. */

export const interestLevelSchema = z.enum(['WATCHING', 'INTERESTED', 'REGISTERED', 'NOT_GOING'])
export const attendDaySchema = z.enum(['DAY_1', 'DAY_2', 'BOTH']).nullable()

export const attendanceSchema = z.object({
  interest_level: interestLevelSchema,
  attend_day: attendDaySchema.optional(),
})

export type InterestLevel = z.infer<typeof interestLevelSchema>
export type AttendDay = z.infer<typeof attendDaySchema>
export type AttendanceInput = z.infer<typeof attendanceSchema>

export interface AttendanceRow {
  user_id: string
  game_id: string
  interest_level: InterestLevel
  attend_day: AttendDay
}

const ATTENDANCE_COLUMNS = 'user_id, game_id, interest_level, attend_day'

/**
 * Create or replace the actor's RSVP for an event. `actorId` comes from the
 * authenticated session/token, never from the request body (and RLS rejects
 * any other user_id anyway).
 */
export async function setAttendance(
  db: DbClient,
  actorId: string,
  eventId: string,
  raw: unknown,
): Promise<AttendanceRow> {
  const parsed = attendanceSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError('Invalid data', parsed.error.flatten())
  }

  const { data, error } = await db
    .from('attendance')
    .upsert(
      {
        user_id: actorId,
        game_id: eventId,
        interest_level: parsed.data.interest_level,
        attend_day: parsed.data.attend_day ?? null,
      },
      { onConflict: 'user_id, game_id' },
    )
    .select(ATTENDANCE_COLUMNS)
    .single()

  if (error) {
    console.error('Error setting attendance:', error)
    if (error.code === '42501') {
      throw new ForbiddenError('Forbidden: You do not have permission to RSVP')
    }
    throw fromPostgrestError(error, 'Failed to update attendance. Please try again later.')
  }
  return data as AttendanceRow
}
