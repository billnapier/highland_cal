'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendUserApprovedNotification } from '@/lib/email'

import { SupabaseClient } from '@supabase/supabase-js'

async function checkAdminRole(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: roleData } = await supabase
    .from('user_roles')
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
    .from('user_roles')
    .update({ role: 'APPROVED' })
    .eq('user_id', userId)

  if (error) {
    console.error('Error approving user:', error)
    return { success: false, error: 'Failed to approve user' }
  }

  // Email is a private field: read it via get_user_private(), which RLS-style
  // gates on admin (+ users:admin scope for tokens) or self.
  const [{ data: profile }, { data: privateRows }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', userId).single(),
    supabase.rpc('get_user_private', { ids: [userId] }),
  ])
  const email = (privateRows as { email: string | null }[] | null)?.[0]?.email

  if (email && profile?.display_name) {
    await sendUserApprovedNotification(profile.display_name, email)
  }

  revalidatePath('/dashboard/admin')
  return { success: true }
}

export async function promoteToAdmin(userId: string) {
  const supabase = await createClient()
  await checkAdminRole(supabase)

  const { error } = await supabase
    .from('user_roles')
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
  const user = await checkAdminRole(supabase)

  if (userId === user.id) {
    return { success: false, error: 'Cannot delete your own account' }
  }

  // The database is the authority: authorize_user_deletion() raises unless the
  // caller is an admin (with users:admin for tokens) deleting someone else.
  const { error: authzError } = await supabase.rpc('authorize_user_deletion', { target: userId })
  if (authzError) {
    console.error('User deletion not authorized:', authzError)
    return { success: false, error: 'Not authorized to delete this user' }
  }

  // Only after the database has authorized it: use the admin client to delete
  // the auth identity (Supabase Auth has no RLS-governed delete).
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.deleteUser(userId)

  if (error) {
    console.error('Error deleting user:', error)
    return { success: false, error: 'Failed to delete user' }
  }

  revalidatePath('/dashboard/admin')
  return { success: true }
}
