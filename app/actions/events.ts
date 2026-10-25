'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { EventFormData } from '@/lib/schemas'
import * as core from '@/lib/core/events'
import { actionErrorMessage, sessionActorId } from '@/lib/core/action'

// Thin wrappers over lib/core/events. RLS on the session client authorizes;
// notification emails are enqueued by database triggers and kicked by core.

function revalidateEvents() {
  revalidatePath('/')
  revalidatePath('/dashboard')
}

export async function deleteEvent(eventId: string) {
  try {
    const supabase = await createClient()
    await sessionActorId(supabase)
    await core.deleteEvent(supabase, eventId)
    revalidateEvents()
    return { success: true }
  } catch (error: unknown) {
    return { success: false, message: actionErrorMessage(error) }
  }
}

export async function createEvent(rawData: EventFormData) {
  try {
    const supabase = await createClient()
    const actorId = await sessionActorId(supabase)
    await core.createEvent(supabase, actorId, rawData)
    revalidateEvents()
    return { success: true }
  } catch (error: unknown) {
    return { success: false, message: actionErrorMessage(error) }
  }
}

export async function updateEvent(eventId: string, rawData: EventFormData, majorChange: boolean) {
  try {
    const supabase = await createClient()
    await sessionActorId(supabase)
    await core.updateEvent(supabase, eventId, rawData, { majorChange })
    revalidateEvents()
    return { success: true }
  } catch (error: unknown) {
    return { success: false, message: actionErrorMessage(error) }
  }
}
