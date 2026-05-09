'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteEvent(eventId: number) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Verify the user is an ADMIN
  const { data: roleData, error: roleError } = await supabase
    .from('User_Roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleError || !roleData || roleData.role !== 'ADMIN') {
    throw new Error('Forbidden: Only admins can delete events')
  }

  // Delete the event
  const { error: deleteError } = await supabase
    .from('Games')
    .delete()
    .eq('id', eventId)

  if (deleteError) {
    throw new Error(`Failed to delete event: ${deleteError.message}`)
  }

  // Stub out the Resend email notifications with console.log()
  console.log(`Email notification: Event with ID ${eventId} deleted`)

  // Revalidate paths to update the UI
  revalidatePath('/')
  revalidatePath('/dashboard')
}
