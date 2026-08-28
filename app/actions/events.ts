'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { eventSchema, EventFormData } from '@/lib/schemas'
import { sendEventNotification } from '@/lib/email'


export async function deleteEvent(eventId: string) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Unauthorized' }
    }

    /*
      ⚡ Bolt: Batch independent Supabase queries
      💡 What: Use Promise.all to fetch the user profile, user role, and event name concurrently instead of sequentially.
      🎯 Why: These three queries do not depend on each other's results. Running them sequentially causes a waterfall effect.
      📊 Impact: Reduces time spent waiting for the database when deleting an event (from T1+T2+T3 to Max(T1, T2, T3)).
      🔬 Measurement: Verify faster execution time of the deleteEvent action.
    */
    const [
      { data: profileData, error: profileError },
      { data: roleData, error: roleError },
      { data: eventData }
    ] = await Promise.all([
      supabase.from('profiles').select('id').eq('id', user.id).single(),
      supabase.from('user_roles').select('role').eq('user_id', user.id).single(),
      supabase.from('games').select('name').eq('id', eventId).single()
    ])

    if (profileError || !profileData) {
      return { success: false, message: 'User profile not found' }
    }

    if (roleError || !roleData || roleData.role !== 'ADMIN') {
      return { success: false, message: 'Forbidden: Only admins can delete events' }
    }

    const eventName = eventData?.name || 'Unknown Event'

    // Delete the event
    const { error: deleteError } = await supabase
      .from('games')
      .delete()
      .eq('id', eventId)

    if (deleteError) {
      return { success: false, message: `Failed to delete event: ${deleteError.message}` }
    }

    await sendEventNotification('DELETE', { name: eventName })

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

export async function createEvent(rawData: EventFormData) {
  try {
    const parsed = eventSchema.safeParse(rawData)
    if (!parsed.success) {
      return { success: false, message: 'Invalid data' }
    }
    const data = parsed.data

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
      return { success: false, message: 'Forbidden: You do not have permission to create events' }
    }

    const payload = {
      name: data.name,
      start_date: data.start_date,
      is_two_day: data.is_two_day,
      type: data.type,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      location: data.location || null,
      registration_url: data.registration_url || null,
      created_by: user.id
    }

    const { error } = await supabase
      .from('games')
      .insert(payload)
      .select()
      .single()

    if (error) {
      console.error('Error creating event:', error)
      return { success: false, message: 'Failed to create event. Please try again later.' }
    }

    // Send notifications to APPROVED and ADMIN users
    await sendEventNotification('CREATE', {
      name: data.name,
      startDate: data.start_date,
      isTwoDay: data.is_two_day,
      type: data.type,
      startTime: data.start_time,
      endTime: data.end_time,
      location: data.location,
      registrationUrl: data.registration_url,
    });

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

export async function updateEvent(eventId: string, rawData: EventFormData, majorChange: boolean) {
  try {
    const parsed = eventSchema.safeParse(rawData)
    if (!parsed.success) {
      return { success: false, message: 'Invalid data' }
    }
    const data = parsed.data

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
      return { success: false, message: 'Forbidden: You do not have permission to edit events' }
    }

    if (roleData.role === 'APPROVED') {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('created_by')
        .eq('id', eventId)
        .single()
        
      if (gameError || !gameData) {
         return { success: false, message: 'Event not found' }
      }
      if (gameData.created_by !== user.id) {
         return { success: false, message: 'Forbidden: You can only edit events you created' }
      }
    }

    const payload = {
      name: data.name,
      start_date: data.start_date,
      is_two_day: data.is_two_day,
      type: data.type,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      location: data.location || null,
      registration_url: data.registration_url || null,
    }

    const { error: updateError } = await supabase
      .from('games')
      .update(payload)
      .eq('id', eventId)

    if (updateError) {
      console.error('Error updating event:', updateError)
      return { success: false, message: 'Failed to update event. Please try again later.' }
    }

    if (majorChange) {
      await sendEventNotification('UPDATE', {
        name: data.name,
        startDate: data.start_date,
        isTwoDay: data.is_two_day,
        type: data.type,
        startTime: data.start_time,
        endTime: data.end_time,
        location: data.location,
        registrationUrl: data.registration_url,
      })
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
