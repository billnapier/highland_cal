import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import { CoreError } from '@/lib/core/errors'
import { addProfileUrl } from '@/lib/core/users'

/**
 * GET /api/v1/users
 * Public roster (APPROVED/ADMIN users only, public fields). 
 * Admin callers with users:admin scope get all users including PENDING,
 * with email and role.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, 'read')
    const { client } = auth
    const identity = auth.kind === 'pat' ? auth.identity : null

    const url = new URL(request.url)
    const role = url.searchParams.get('role')
    const limitParam = url.searchParams.get('limit')
    const cursor = url.searchParams.get('cursor')
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 200)

    // Check if caller is admin with users:admin scope
    const isAdminView = identity?.scopes.includes('users:admin')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = client as any

    if (isAdminView) {
      // Admin: get all users with email and role via get_user_private
      // Actually, user_roles is public and we join for the role
      // For email we use get_user_private since profiles.email is no longer public
      let query = db
        .from('profiles')
        .select('id, display_name, vanity_name, class, avatar_url, outward_links, created_at, role:user_roles!inner(role)')
        .limit(limit + 1)
        .order('display_name', { ascending: true, nullsFirst: false })

      if (role) query = query.eq('user_roles.role', role)
      if (cursor) query = query.gt('display_name', cursor)

      const { data: rows, error } = await query

      if (error) {
        console.error('Error listing users (admin):', error)
        return errorResponse(new CoreError('internal', 'Failed to list users'))
      }

      const items = rows || []
      const hasMore = items.length > limit
      const users = hasMore ? items.slice(0, limit) : items

      // Flatten the joined role:user_roles!inner(role) shape to a plain string.
      for (const user of users) {
        const joined = user.role as { role?: string } | undefined
        user.role = joined?.role ?? null
      }

      // Add computed profile_url
      const usersWithUrl = users.map((u: Record<string, unknown>) => addProfileUrl(u as Parameters<typeof addProfileUrl>[0]))

      // Get private fields (email) for these users
      if (users.length > 0) {
        const userIds = users.map((u: Record<string, unknown>) => u.id)
        const { data: privateData } = await db.rpc('get_user_private', { ids: userIds })
        if (privateData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const emailMap = new Map(privateData.map((p: any) => [p.id, p.email]))
          for (const user of users) {
            user.email = emailMap.get(user.id) || null
          }
        }
      }

      let nextCursor: string | null = null
      if (hasMore && users.length > 0) {
        nextCursor = users[users.length - 1].display_name
      }

      return jsonResponse({ data: usersWithUrl, next_cursor: nextCursor }, 200, identity?.rate_limit ?? null)
    }

    // Public roster: only APPROVED/ADMIN users via join, public fields
    let query = db
      .from('profiles')
      .select('id, display_name, vanity_name, class, avatar_url, outward_links, created_at, role:user_roles!inner(role)')
      .in('user_roles.role', ['APPROVED', 'ADMIN'])
      .limit(limit + 1)
      .order('display_name', { ascending: true })

    if (cursor) query = query.gt('display_name', cursor)

    const { data: rows, error } = await query

    if (error) {
      console.error('Error listing users (public):', error)
      return errorResponse(new CoreError('internal', 'Failed to list users'))
    }

    const items = rows || []
    const hasMore = items.length > limit
    const users = hasMore ? items.slice(0, limit) : items

    // Public view: strip role from response
    const publicUsers = users.map((u: Record<string, unknown>) => {
      const { role: _role, ...rest } = u
      return rest
    })

    // Add computed profile_url to public users
    const publicUsersWithUrl = publicUsers.map((u: Record<string, unknown>) => addProfileUrl(u as Parameters<typeof addProfileUrl>[0]))

    let nextCursor: string | null = null
    if (hasMore && publicUsersWithUrl.length > 0) {
      nextCursor = publicUsersWithUrl[publicUsersWithUrl.length - 1].display_name as string
    }

    return jsonResponse({ data: publicUsersWithUrl, next_cursor: nextCursor }, 200)
  } catch (e) {
    return errorResponse(e)
  }
}