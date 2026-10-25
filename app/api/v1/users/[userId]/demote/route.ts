import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import * as coreUsers from '@/lib/core/users'
import { NotFoundError } from '@/lib/core/errors'

interface RouteParams {
  params: Promise<{ userId: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve a user identifier (UUID or vanity name) to a UUID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveUserId(db: any, userId: string): Promise<string> {
  if (UUID_RE.test(userId)) return userId
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('vanity_name', userId)
    .maybeSingle()
  if (!profile) throw new NotFoundError('User not found')
  return profile.id
}

/**
 * POST /api/v1/users/{userId}/demote
 * Demote an admin back to approved member. ADMIN only; scope users:admin.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const rawId = (await params).userId
    const auth = await requireAuth(request, 'write')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = auth.client as any
    const userId = await resolveUserId(db, rawId)

    await coreUsers.demoteFromAdmin(auth.client, userId)

    // Return the updated user
    const { data: user, error } = await db
      .from('profiles')
      .select('id, display_name, vanity_name, class, avatar_url, outward_links, created_at, role:user_roles!inner(role)')
      .eq('id', userId)
      .maybeSingle()

    if (error || !user) {
      return errorResponse(new NotFoundError('User not found'))
    }

    // Flatten the joined role:user_roles!inner(role) shape to a plain string.
    user.role = (user.role as { role?: string } | undefined)?.role ?? null

    return jsonResponse(coreUsers.addProfileUrl(user), 200, auth.identity.rate_limit)
  } catch (e) {
    return errorResponse(e)
  }
}