'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import * as core from '@/lib/core/tokens'
import { actionErrorMessage, sessionActorId } from '@/lib/core/action'

// API token management for /dashboard/profile. Creation is session-only by
// RLS; the plaintext token is returned once and never stored or logged.

export async function createApiToken(input: core.CreateTokenInput) {
  try {
    const supabase = await createClient()
    const actorId = await sessionActorId(supabase)
    const { token, row } = await core.createToken(supabase, actorId, input)
    revalidatePath('/dashboard/profile')
    return { success: true as const, token, row }
  } catch (error: unknown) {
    return { success: false as const, message: actionErrorMessage(error) }
  }
}

export async function revokeApiToken(tokenId: string) {
  try {
    const supabase = await createClient()
    await sessionActorId(supabase)
    await core.revokeToken(supabase, tokenId)
    revalidatePath('/dashboard/profile')
    return { success: true as const }
  } catch (error: unknown) {
    return { success: false as const, message: actionErrorMessage(error) }
  }
}
