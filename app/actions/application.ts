'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { applicationSchema, ApplicationFormData } from '@/lib/schemas'

export async function submitApplication(data: ApplicationFormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, message: 'Not authenticated' }
  }

  const validatedFields = applicationSchema.safeParse(data)

  if (!validatedFields.success) {
    return { success: false, message: 'Invalid fields', details: validatedFields.error.flatten() }
  }

  const { throwing_experience, attended_practice } = validatedFields.data

  const { error } = await supabase
    .from('profiles')
    .update({ 
      throwing_experience,
      attended_practice
    })
    .eq('id', user.id)

  if (error) {
    console.error("Error submitting application", error)
    return { success: false, message: 'Failed to submit application' }
  }

  revalidatePath('/dashboard')
  return { success: true }
}
