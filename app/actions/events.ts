'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteEvent(eventId: number) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Unauthorized' }
    }

    // Defensive check: verify user exists in Profiles
    const { data: profileData, error: profileError } = await supabase
      .from('Profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (profileError || !profileData) {
      return { success: false, message: 'User profile not found' }
    }

    // Verify the user is an ADMIN
    const { data: roleData, error: roleError } = await supabase
      .from('User_Roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleError || !roleData || roleData.role !== 'ADMIN') {
      return { success: false, message: 'Forbidden: Only admins can delete events' }
    }

    // Delete the event
    const { error: deleteError } = await supabase
      .from('Games')
      .delete()
      .eq('id', eventId)

    if (deleteError) {
      return { success: false, message: `Failed to delete event: ${deleteError.message}` }
    }

    // Stub out the Resend email notifications with console.log()
    console.log(`Email notification: Event with ID ${eventId} deleted`)

    // Revalidate paths to update the UI
    revalidatePath('/')
    revalidatePath('/dashboard')

    return { success: true }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message || 'An unexpected error occurred' }
    }
    return { success: false, message: 'An unexpected error occurred' }
  }
}
