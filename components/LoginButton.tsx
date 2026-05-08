'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from './ui/button'

export default function LoginButton() {
  const supabase = createClient()

  const handleLogin = async () => {
    const origin = window.location.origin
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    })
  }

  return (
    <Button onClick={handleLogin} size="lg" className="w-full sm:w-auto">
      Login with Google
    </Button>
  )
}
