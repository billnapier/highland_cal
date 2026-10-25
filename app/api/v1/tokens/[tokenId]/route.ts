import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse } from '@/lib/api/response'
import * as coreTokens from '@/lib/core/tokens'

interface RouteParams {
  params: Promise<{ tokenId: string }>
}

/**
 * DELETE /api/v1/tokens/{tokenId}
 * Revoke one of the caller's tokens. A token may revoke itself.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { tokenId } = await params
    const auth = await requireAuth(request, 'write')
    const { client } = auth

    await coreTokens.revokeToken(client, tokenId)

    return new Response(null, { status: 204 })
  } catch (e) {
    return errorResponse(e)
  }
}