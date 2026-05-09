import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && session) {
      // Admin Bootstrapping Logic
      const userEmail = session.user.email
      const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL

      if (userEmail && initialAdminEmail && userEmail === initialAdminEmail) {
        // Fetch current role to see if they are already admin
        const { data: roleData } = await supabase
          .from('User_Roles')
          .select('role')
          .eq('user_id', session.user.id)
          .single()

        if (roleData && roleData.role !== 'ADMIN') {
          const adminSupabase = createAdminClient()
          await adminSupabase
            .from('User_Roles')
            .update({ role: 'ADMIN' })
            .eq('user_id', session.user.id)
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      // Dispatch email notification if the user was just created
      const userCreatedAt = new Date(session.user.created_at).getTime()
      const now = Date.now()
      if (now - userCreatedAt < 60000) {
        // Only trigger within 1 minute of account creation
        const displayName = session.user.user_metadata?.full_name || session.user.email || 'Unknown User'
        const email = session.user.email || ''
        if (email) {
          // Fire and forget so we don't block the login redirect
          import('@/lib/email').then(({ sendNewRegistrationNotification }) => {
            sendNewRegistrationNotification(displayName, email).catch(console.error)
          })
        }
      }

      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
