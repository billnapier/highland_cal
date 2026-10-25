import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse, noContentResponse } from '@/lib/api/response'
import * as coreTokens from '@/lib/core/tokens'

interface RouteParams {
  params: Promise<{ tokenId: string }>
}

/**
 * DELETE /api/v1/tokens/{tokenId}
 * Revoke one of the caller's tokens. A token may revoke itself.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  let rateLimit: { limit: number; remaining: number; reset: number } | null = null
  try {
    const { tokenId } = await params
    const auth = await requireAuth(request, 'write')
    const { client, identity } = auth
    rateLimit = identity.rate_limit

    await coreTokens.revokeToken(client, tokenId)

    return noContentResponse(rateLimit)
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}