import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Fetch the user's role
  const { data: roleData } = await supabase
    .from('User_Roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  // Fetch the user's profile
  const { data: profileData } = await supabase
    .from('Profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .single()

  const role = roleData?.role || 'UNKNOWN'

  return (
    <main className="flex flex-1 flex-col p-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Welcome, {profileData?.display_name || user.email}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-muted-foreground">Account Status</h3>
              <div className="mt-2 flex items-center space-x-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                  ${role === 'ADMIN' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' : ''}
                  ${role === 'APPROVED' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : ''}
                  ${role === 'PENDING' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' : ''}
                  ${role === 'UNKNOWN' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' : ''}
                `}>
                  {role}
                </span>
                {role === 'PENDING' && (
                  <p className="text-sm text-muted-foreground">
                    Your account is pending approval by an administrator.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
