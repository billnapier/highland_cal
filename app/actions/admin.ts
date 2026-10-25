'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import * as core from '@/lib/core/users'
import type { DbClient } from '@/lib/core/client'
import { actionErrorMessage, sessionActorId } from '@/lib/core/action'

// Thin wrappers over lib/core/users. RLS ("Only admins can update roles") and
// authorize_user_deletion() are the authority; there is no app-side role check.

async function run(op: (db: DbClient, userId: string) => Promise<void>, userId: string) {
  try {
    const supabase = await createClient()
    await sessionActorId(supabase)
    await op(supabase, userId)
    revalidatePath('/dashboard/admin')
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: actionErrorMessage(error) }
  }
}

export async function approveUser(userId: string) {
  return run(core.approveUser, userId)
}

export async function promoteToAdmin(userId: string) {
  return run(core.promoteToAdmin, userId)
}

export async function deleteUser(userId: string) {
  return run(core.deleteUser, userId)
}
