'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type InterestLevel = 'WATCHING' | 'INTERESTED' | 'REGISTERED' | 'NOT_GOING';
export type AttendDay = 'DAY_1' | 'DAY_2' | 'BOTH' | null;

export async function setAttendance(gameId: string, interestLevel: InterestLevel, attendDay?: AttendDay) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Unauthorized' }
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleError || !roleData || (roleData.role !== 'ADMIN' && roleData.role !== 'APPROVED')) {
      return { success: false, message: 'Forbidden: You do not have permission to RSVP' }
    }

    const { error: upsertError } = await supabase
      .from('attendance')
      .upsert({
        user_id: user.id,
        game_id: gameId,
        interest_level: interestLevel,
        attend_day: attendDay || null,
      }, { onConflict: 'user_id, game_id' })

    if (upsertError) {
      console.error(upsertError)
      return { success: false, message: 'Failed to update attendance. Please try again later.' }
    }

    // Revalidate paths to update the UI
    revalidatePath('/dashboard')

    return { success: true }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message || 'An unexpected error occurred' }
    }
    return { success: false, message: 'An unexpected error occurred' }
  }
}
