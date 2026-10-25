'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import * as core from '@/lib/core/attendance'
import { actionErrorMessage, sessionActorId } from '@/lib/core/action'

export type InterestLevel = core.InterestLevel
export type AttendDay = core.AttendDay

export async function setAttendance(gameId: string, interestLevel: InterestLevel, attendDay?: AttendDay) {
  try {
    const supabase = await createClient()
    const actorId = await sessionActorId(supabase)
    await core.setAttendance(supabase, actorId, gameId, {
      interest_level: interestLevel,
      attend_day: attendDay || null,
    })
    revalidatePath('/dashboard')
    return { success: true }
  } catch (error: unknown) {
    return { success: false, message: actionErrorMessage(error) }
  }
}
