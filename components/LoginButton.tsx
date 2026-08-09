'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from './ui/button'
import { Loader2 } from 'lucide-react'

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
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async () => {
    try {
      setIsLoading(true)
      const origin = window.location.origin
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
        },
      })
      if (error) {
        setIsLoading(false)
        console.error('Login error:', error)
      }
    } catch (error) {
      setIsLoading(false)
      throw error
    }
  }

  return (
    <Button
      onClick={handleLogin}
      variant={variant}
      size={size}
      className={className}
      disabled={isLoading}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {isLoading ? "Loading..." : text}
    </Button>
  )
}
