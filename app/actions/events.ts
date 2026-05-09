'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteEvent(eventId: string) {
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

export async function createEvent(data: {
  name: string
  start_timestamp: string
  end_timestamp: string
  local_timezone: string
  location?: string
  registration_url?: string
}) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Unauthorized' }
    }

    const { data: roleData, error: roleError } = await supabase
      .from('User_Roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleError || !roleData || (roleData.role !== 'ADMIN' && roleData.role !== 'APPROVED')) {
      return { success: false, message: 'Forbidden: You do not have permission to create events' }
    }

    const { data: insertedGame, error: insertError } = await supabase
      .from('Games')
      .insert([
        {
          name: data.name,
          start_timestamp: data.start_timestamp,
          end_timestamp: data.end_timestamp,
          local_timezone: data.local_timezone,
          location: data.location || null,
          registration_url: data.registration_url || null,
          created_by: user.id
        }
      ])
      .select('id')
      .single()

    if (insertError) {
      return { success: false, message: `Failed to create event: ${insertError.message}` }
    }

    // Stub out the Resend email notifications with console.log()
    console.log(`Email notification: New event created with ID ${insertedGame?.id}`)

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

export async function updateEvent(eventId: string, data: {
  name: string
  start_timestamp: string
  end_timestamp: string
  local_timezone: string
  location?: string
  registration_url?: string
}, majorChange: boolean) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Unauthorized' }
    }

    const { data: roleData, error: roleError } = await supabase
      .from('User_Roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleError || !roleData || (roleData.role !== 'ADMIN' && roleData.role !== 'APPROVED')) {
      return { success: false, message: 'Forbidden: You do not have permission to edit events' }
    }

    const { error: updateError } = await supabase
      .from('Games')
      .update({
        name: data.name,
        start_timestamp: data.start_timestamp,
        end_timestamp: data.end_timestamp,
        local_timezone: data.local_timezone,
        location: data.location || null,
        registration_url: data.registration_url || null,
      })
      .eq('id', eventId)

    if (updateError) {
      return { success: false, message: `Failed to update event: ${updateError.message}` }
    }

    // Stub out the Resend email notifications with console.log()
    if (majorChange) {
      console.log(`Email notification: Major edit to event with ID ${eventId}`)
    }

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
