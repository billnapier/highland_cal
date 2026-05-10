'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from './ui/button'

interface LoginButtonProps {
  text?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export default function LoginButton({ 
  text = "Login with Google", 
  variant = "default",
  size = "lg",
  className = "w-full sm:w-auto"
}: LoginButtonProps) {
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
    <Button onClick={handleLogin} variant={variant} size={size} className={className}>
      {text}
    </Button>
  )
}
