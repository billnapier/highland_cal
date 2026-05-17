'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateSetting(key: string, value: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, message: 'Not authenticated' }
  }

  // Verify admin
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleData?.role !== 'ADMIN') {
    return { success: false, message: 'Not authorized' }
  }

  const { error } = await supabase
    .from('settings')
    .upsert({ key, value })

  if (error) {
    console.error(`Error updating setting ${key}`, error)
    return { success: false, message: `Failed to update ${key}` }
  }

  revalidatePath('/')
  revalidatePath('/dashboard/admin')
  return { success: true }
}
