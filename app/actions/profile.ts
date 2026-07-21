'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { profileSchema, ProfileFormData } from '@/lib/schemas'

export async function updateProfile(data: ProfileFormData) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, message: 'Not authenticated' }
    }

    const validatedFields = profileSchema.safeParse(data)

    if (!validatedFields.success) {
      return { success: false, message: 'Invalid fields', details: validatedFields.error.flatten() }
    }

    const { class: competitionClass, avatar_url, instagram, facebook, customLinks, vanity_name } = validatedFields.data as ProfileFormData

    const outward_links = {
      instagram: instagram || null,
      facebook: facebook || null,
      customLinks: customLinks || []
    }

    // Check if vanity_name is actually changing
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('vanity_name')
      .eq('id', user.id)
      .single()

    const vanityChanged = (currentProfile?.vanity_name || '') !== (vanity_name || '')

    if (vanityChanged) {
      // Check user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()

      if (!roleData || (roleData.role !== 'APPROVED' && roleData.role !== 'ADMIN')) {
        return { success: false, message: 'Only approved users and admins can set, update, or clear a vanity name.' }
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ 
        class: competitionClass || null,
        avatar_url: avatar_url || null,
        outward_links,
        vanity_name: vanity_name || null
      })
      .eq('id', user.id)

    if (error) {
      console.error("Error updating profile", error)
      if (error.code === '23505') {
        return { success: false, message: 'This vanity name is already taken. Please choose another one.' }
      }
      return { success: false, message: error.message || 'Failed to update profile' }
    }

    revalidatePath('/dashboard/profile')
    revalidatePath('/')
    if (vanity_name) {
      revalidatePath(`/roster/${vanity_name}`)
    }
    revalidatePath(`/roster/${user.id}`)
    return { success: true }
  } catch (error: unknown) {
    console.error("Unhandled error in updateProfile action:", error)
    if (error instanceof Error) {
      return { success: false, message: error.message || 'An unexpected error occurred' }
    }
    return { success: false, message: 'An unexpected error occurred' }
  }
}
