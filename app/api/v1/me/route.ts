import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import { NotFoundError } from '@/lib/core/errors'

/**
 * GET /api/v1/me
 * Returns the authenticated user, role, token scopes, and capabilities.
 * Agents should call this first to confirm identity.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request, 'read')
    const { client, identity } = auth

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: user, error } = await client
      .from('profiles')
      .select('id, display_name, vanity_name, class, avatar_url, outward_links, created_at, email')
      .eq('id', identity.user_id)
      .maybeSingle() as unknown as { data: Record<string, unknown> | null; error: unknown }

    if (error || !user) throw new NotFoundError('User not found')

    const body = {
      user: {
        id: user.id,
        display_name: user.display_name,
        vanity_name: user.vanity_name || null,
        class: user.class || null,
        avatar_url: user.avatar_url || null,
        outward_links: user.outward_links || null,
        email: user.email,
        role: identity.role,
        created_at: user.created_at,
      },
      role: identity.role,
      token: {
        id: identity.token_id,
        scopes: identity.scopes,
      },
      capabilities: identity.scopes,
    }

    return jsonResponse(body, 200, identity.rate_limit)
  } catch (e) {
    return errorResponse(e)
  }
}