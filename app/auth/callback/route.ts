import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { kickNotifications } from '@/lib/notifications'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get('next') ?? '/dashboard'

  // 🛡️ Sentinel: Sanitize `next` to prevent Open Redirect vulnerabilities
  if (!next.startsWith('/') || next.startsWith('//')) {
    next = '/dashboard'
  }

  if (code) {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && session) {
      // Admin Bootstrapping Logic
      const userEmail = session.user.email
      const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL

      if (userEmail && initialAdminEmail && userEmail.toLowerCase() === initialAdminEmail.toLowerCase()) {
        // Fetch current role to see if they are already admin
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .single()

        if (!roleData || roleData.role !== 'ADMIN') {
          const adminSupabase = createAdminClient()
          
          // Ensure profile exists (it might not if they were created before triggers or trigger failed)
          const { error: profileError } = await adminSupabase
            .from('profiles')
            .upsert({ 
              id: session.user.id, 
              email: session.user.email,
              display_name: session.user.user_metadata?.full_name || session.user.email?.split('@')?.[0] || 'Admin User'
            }, { onConflict: 'id', ignoreDuplicates: true })
            
          if (profileError) {
            console.error('Failed to upsert Profile for admin:', profileError)
          }

          const { error: roleError } = await adminSupabase
            .from('user_roles')
            .upsert({ user_id: session.user.id, role: 'ADMIN' })
            
          if (roleError) {
            console.error('Failed to upsert User_Roles for admin:', roleError)
          }
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      // New-user registration emails are enqueued exactly once by the signup
      // trigger (handle_new_user); deliver anything pending after the redirect.
      kickNotifications()

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
