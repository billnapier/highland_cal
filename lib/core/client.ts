import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The client a `lib/core` operation runs its queries with. It is always
 * supplied by the caller:
 * - Server Actions pass the cookie-session client (`lib/supabase/server.ts`).
 * - API routes pass the token-bound anon-key client (`lib/api/auth.ts`).
 *
 * Never the service-role client: RLS on this client is what authorizes the
 * operation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = SupabaseClient<any, any, any>

export { NOTIFY_HEADER, MAJOR_CHANGE_HEADER } from '@/lib/notifications'
