'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

import { SupabaseClient } from '@supabase/supabase-js'

async function checkAdminRole(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: roleData } = await supabase
    .from('User_Roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (roleData?.role !== 'ADMIN') {
    throw new Error('Not authorized')
  }

  return user
}

export async function approveUser(userId: string) {
  const supabase = await createClient()
  await checkAdminRole(supabase)

  const { error } = await supabase
    .from('User_Roles')
    .update({ role: 'APPROVED' })
    .eq('user_id', userId)

  if (error) {
    console.error('Error approving user:', error)
    return { success: false, error: 'Failed to approve user' }
  }

  // TODO: Implement email notification (Milestone 10)
  console.log(`[Email Stub] User ${userId} has been approved.`)

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function promoteToAdmin(userId: string) {
  const supabase = await createClient()
  await checkAdminRole(supabase)

  const { error } = await supabase
    .from('User_Roles')
    .update({ role: 'ADMIN' })
    .eq('user_id', userId)

  if (error) {
    console.error('Error promoting user:', error)
    return { success: false, error: 'Failed to promote user' }
  }

  // TODO: Implement email notification (Milestone 10)
  console.log(`[Email Stub] User ${userId} has been promoted to ADMIN.`)

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function deleteUser(userId: string) {
  const supabase = await createClient()
  await checkAdminRole(supabase)

  // Use the admin client to bypass RLS and delete the auth identity
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.deleteUser(userId)

  if (error) {
    console.error('Error deleting user:', error)
    return { success: false, error: 'Failed to delete user' }
  }

  revalidatePath('/dashboard/admin')
  return { success: true }
}
