import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/api/auth'
import { errorResponse, jsonResponse } from '@/lib/api/response'
import * as coreTokens from '@/lib/core/tokens'

/**
 * GET /api/v1/tokens
 * List the caller's tokens (metadata only — the secret is never returned).
 */
export async function GET(request: NextRequest) {
  let rateLimit: { limit: number; remaining: number; reset: number } | null = null
  try {
    const auth = await requireAuth(request, 'read')
    const { client, identity } = auth
    rateLimit = identity.rate_limit

    const tokens = await coreTokens.listTokens(client)

    return jsonResponse({ data: tokens }, 200, rateLimit)
  } catch (e) {
    return errorResponse(e, rateLimit)
  }
}