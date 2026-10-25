import type { NextRequest } from 'next/server'
import { authenticateRequest, requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import { NotFoundError, CoreError } from '@/lib/core/errors'
import * as coreUsers from '@/lib/core/users'

/**
 * Resolve a user identifier (UUID or vanity name) to a UUID.
 * Returns the UUID if valid, or looks up the vanity name in profiles.
 * Throws NotFoundError if the vanity name doesn't resolve.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveUserId(db: any, userId: string): Promise<string> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
  if (isUuid) return userId

  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('vanity_name', userId)
    .maybeSingle()

  if (!profile) throw new NotFoundError('User not found')
  return profile.id
}

interface RouteParams {
  params: Promise<{ userId: string }>
}

/**
 * Get a user by UUID or vanity name.
 * Public fields for all; email and role for admins with users:admin.
 *
 * Handles both UUIDs and vanity names in the path.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params
    const auth = await authenticateRequest(request, 'read')
    const { client } = auth
    const identity = auth.kind === 'pat' ? auth.identity : null

    // Resolve userId: it could be a UUID or a vanity name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    // Try UUID first
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)

    const { data: profile, error } = await db
      .from('profiles')
      .select('id, display_name, vanity_name, class, avatar_url, outward_links, created_at, role:user_roles!inner(role)')
      .or(isUuid ? `id.eq.${userId},vanity_name.eq.${userId}` : `vanity_name.eq.${userId}`)
      .maybeSingle()

    if (error) {
      console.error('Error fetching user:', error)
      return errorResponse(new CoreError('internal', 'Failed to fetch user'))
    }
    if (!profile) {
      return errorResponse(new NotFoundError('User not found'))
    }

    const isAdminView = identity?.scopes.includes('users:admin')
    const isSelf = identity?.user_id === profile.id

    // Flatten the joined role:user_roles!inner(role) shape to a plain string.
    const roleValue = (profile.role as { role?: string } | undefined)?.role ?? null

    const result: Record<string, unknown> = {
      id: profile.id,
      display_name: profile.display_name,
      vanity_name: profile.vanity_name || null,
      class: profile.class || null,
      avatar_url: profile.avatar_url || null,
      outward_links: profile.outward_links || null,
      created_at: profile.created_at,
    }

    // Include email and role for admins with users:admin, or for self
    if (isAdminView || isSelf) {
      result.role = roleValue

      // email is not grantable at the column level; always resolve it via
      // get_user_private() (self or admin-with-scope, both permitted there).
      const { data: privateData } = await db.rpc('get_user_private', { ids: [profile.id] })
      if (privateData && Array.isArray(privateData) && privateData.length > 0) {
        result.email = privateData[0].email || null
      }
    }

    return jsonResponse(result, 200, identity?.rate_limit ?? null)
  } catch (e) {
    return errorResponse(e)
  }
}

/**
 * DELETE /api/v1/users/{userId}
 * Permanently delete a user. ADMIN only; scope users:admin.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireAuth(request, 'write')
    const rawId = (await params).userId
    const userId = await resolveUserId(auth.client, rawId)

    await coreUsers.deleteUser(auth.client, userId)

    return new Response(null, { status: 204 })
  } catch (e) {
    return errorResponse(e)
  }
}