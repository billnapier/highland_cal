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

    const { class: competitionClass, avatar_url, instagram, facebook, customLinks } = validatedFields.data as ProfileFormData

    const outward_links = {
      instagram: instagram || null,
      facebook: facebook || null,
      customLinks: customLinks || []
    }

    const { error } = await supabase
      .from('profiles')
      .update({ 
        class: competitionClass || null,
        avatar_url: avatar_url || null,
        outward_links
      })
      .eq('id', user.id)

    if (error) {
      console.error("Error updating profile", error)
      return { success: false, message: error.message || 'Failed to update profile' }
    }

    revalidatePath('/dashboard/profile')
    revalidatePath('/')
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
