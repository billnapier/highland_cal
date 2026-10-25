import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import * as coreUsers from '@/lib/core/users'
import { NotFoundError, CoreError } from '@/lib/core/errors'

interface RouteParams {
  params: Promise<{ userId: string }>
}

/**
 * POST /api/v1/users/{userId}/approve
 * Approve a pending user. ADMIN only; scope users:admin.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth

    await coreUsers.approveUser(client, userId)

    // Return the updated user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any
    const { data: user, error } = await db
      .from('profiles')
      .select('id, display_name, vanity_name, class, avatar_url, outward_links, created_at, role:user_roles!inner(role)')
      .eq('id', userId)
      .maybeSingle()

    if (error || !user) {
      return errorResponse(new NotFoundError('User not found'))
    }

    return jsonResponse(user, 200, identity.rate_limit)
  } catch (e) {
    return errorResponse(e)
  }
}