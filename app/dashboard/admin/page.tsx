import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ApproveButton, PromoteButton, DeleteUserButton } from '@/components/UserManagementButtons'
import { AdminSettings } from '@/components/AdminSettings'

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Ensure only ADMINs can view this page
  const { data: currentRoleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (currentRoleData?.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  // Fetch all users with their roles
  // Because Profiles and User_Roles are separate tables that share an ID (id and user_id),
  // we can do a join.
  const { data: users, error } = await supabase
    .from('profiles')
    .select(`
      id,
      display_name,
      email,
      class,
      created_at,
      user_roles (
        role
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching users:', error)
  }

  // Fetch settings
  const { data: settingsData } = await supabase
    .from('settings')
    .select('key, value')

  const settingsMap = settingsData?.reduce((acc: Record<string, string>, setting: { key: string, value: string }) => {
    acc[setting.key] = setting.value
    return acc
  }, {} as Record<string, string>) || {}

  const clubName = settingsMap['club_name'] || 'Highland Cal'
  const clubBlurb = settingsMap['club_blurb'] || 'We are a community of athletes dedicated to the traditional Scottish Highland Games. Whether you are a seasoned A-class thrower or looking to try the caber toss for the very first time, Highland Cal is where we organize practices, coordinate game attendance, and support each other on the field.'
  const heroImage = settingsMap['hero_image_url'] || ''

  return (
    <main className="flex flex-1 flex-col p-8 bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/80 dark:from-slate-950 dark:via-blue-950/20 dark:to-indigo-950/30 min-h-[calc(100vh-4rem)]">
      <div className="mx-auto w-full max-w-5xl space-y-12">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage settings, approve registrations, and assign roles.</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">Site Settings</h2>
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-card-foreground shadow-xl p-6">
            <AdminSettings initialClubName={clubName} initialClubBlurb={clubBlurb} initialHeroImage={heroImage} />
          </div>
        </section>
        
        <section className="space-y-4">
          <h2 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">User Management</h2>
          <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-card-foreground shadow-xl overflow-hidden">
            {error ? (
              <div className="p-6 text-center text-red-500">
                Failed to load users. Please try again later.
              </div>
            ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th scope="col" className="px-6 py-3">Name / Email</th>
                  <th scope="col" className="px-6 py-3">Class</th>
                  <th scope="col" className="px-6 py-3">Role</th>
                  <th scope="col" className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users?.map((u: { id: string, display_name: string | null, email: string | null, class: string | null, created_at: string, user_roles: { role: string }[] | { role: string } | null }) => {
                  const roleObj = u.user_roles;
                  const role = Array.isArray(roleObj) 
                    ? (roleObj.length > 0 ? roleObj[0].role : 'UNKNOWN') 
                    : (roleObj?.role || 'UNKNOWN')
                  
                  return (
                    <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{u.display_name}</div>
                        <div className="text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        {u.class || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-inset ring-white/20
                          ${role === 'ADMIN' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600' : ''}
                          ${role === 'APPROVED' ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : ''}
                          ${role === 'PENDING' ? 'bg-gradient-to-r from-amber-400 to-orange-500' : ''}
                          ${role === 'UNKNOWN' ? 'bg-gradient-to-r from-slate-400 to-slate-500' : ''}
                        `}>
                          {role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {role === 'PENDING' && <ApproveButton userId={u.id} />}
                          {role === 'APPROVED' && <PromoteButton userId={u.id} />}
                          {u.id !== user.id && <DeleteUserButton userId={u.id} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {users?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
