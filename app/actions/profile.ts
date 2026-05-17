'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { profileSchema, ProfileFormData } from '@/lib/schemas'

export async function updateProfile(data: ProfileFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, message: 'Not authenticated' }
  }

  const validatedFields = profileSchema.safeParse(data)

  if (!validatedFields.success) {
    return { success: false, message: 'Invalid fields', details: validatedFields.error.flatten() }
  }

  const { class: competitionClass, instagram, facebook, customLinks } = validatedFields.data

  const outward_links = {
    instagram: instagram || null,
    facebook: facebook || null,
    customLinks: customLinks || []
  }

  const { error } = await supabase
    .from('profiles')
    .update({ 
      class: competitionClass || null,
      outward_links
    })
    .eq('id', user.id)

  if (error) {
    console.error("Error updating profile", error)
    return { success: false, message: 'Failed to update profile' }
  }

  revalidatePath('/dashboard/profile')
  revalidatePath('/')
  revalidatePath(`/roster/${user.id}`)
  return { success: true }
}
