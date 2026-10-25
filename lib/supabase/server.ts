import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Per-request Supabase client bound to the user's session cookie.
 * `headers` are sent on every PostgREST request made with this client; used
 * for the notification flags read by the outbox triggers
 * (x-hcal-notify / x-hcal-major-change).
 */
export async function createClient(options: { headers?: Record<string, string> } = {}) {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: options.headers ? { headers: options.headers } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
