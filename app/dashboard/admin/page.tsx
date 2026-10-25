import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ApproveButton, PromoteButton, DemoteButton, DeleteUserButton } from '@/components/UserManagementButtons'
import { AdminSettings } from '@/components/AdminSettings'
import { AdminUserFilter } from './filter'

export default async function AdminDashboardPage(props: {
  searchParams: Promise<{ role?: string }>
}) {
  const searchParams = await props.searchParams
  const supabase = await createClient()

  const { data, error: authError } = await supabase.auth.getUser()
  const user = data?.user

  if (authError || !user) {
    redirect('/')
  }

  // Ensure only ADMINs can view this page (joined query to reduce latency)
  const { data: profileWithRole } = await supabase
    .from('profiles')
    .select('user_roles(role)')
    .eq('id', user.id)
    .single()

  const roleRecord = (profileWithRole as unknown as { user_roles: { role: string } | { role: string }[] | null })?.user_roles
  const role = (Array.isArray(roleRecord) ? roleRecord[0]?.role : roleRecord?.role) || 'UNKNOWN'

  if (role !== 'ADMIN') {
    redirect('/dashboard')
  }

  // Role filter from URL
  const filterRole = searchParams.role?.toUpperCase()
  const validRoles = ['PENDING', 'APPROVED', 'ADMIN'] as const
  const activeFilter: string | null = validRoles.includes(filterRole as typeof validRoles[number]) ? (filterRole ?? null) : null

  // Fetch all users with their roles (joined query) and settings concurrently
  let query = supabase
    .from('profiles')
    .select(`
      id,
      display_name,
      class,
      created_at,
      user_roles (
        role
      )
    `)

  if (activeFilter) {
    query = query.eq('user_roles.role', activeFilter)
  }

  const [{ data: users, error }, { data: settingsData }] = await Promise.all([
    query.order('created_at', { ascending: false }),
    supabase
      .from('settings')
      .select('key, value')
  ])

  if (error) {
    console.error('Error fetching users:', error)
  }

  // Emails are private: fetch them via get_user_private(), which only returns
  // other users' fields to admins.
  const { data: privateRows, error: privateError } = users?.length
    ? await supabase.rpc('get_user_private', { ids: users.map((u: { id: string }) => u.id) })
    : { data: [], error: null }
  if (privateError) {
    console.error('Error fetching user emails:', privateError)
  }
  const emailById = new Map(
    ((privateRows as { id: string; email: string | null }[] | null) ?? []).map((r) => [r.id, r.email])
  )
  const usersWithEmail = users?.map((u) => ({ ...u, email: emailById.get(u.id) ?? null }))

  // Sort: pending users first, then admins, then approved
  const roleOrder: Record<string, number> = { PENDING: 0, ADMIN: 1, APPROVED: 2, UNKNOWN: 3 }
  const sortedUsers = [...(usersWithEmail || [])].sort((a, b) => {
    const roleA = getRole(a)
    const roleB = getRole(b)
    return (roleOrder[roleA] ?? 99) - (roleOrder[roleB] ?? 99)
  })

  const pendingCount = sortedUsers.filter((u) => getRole(u) === 'PENDING').length

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">User Management</h2>
              {pendingCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/50 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 shadow-sm">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <AdminUserFilter currentFilter={activeFilter} />
          </div>
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
                {sortedUsers.map((u: {
                  id: string
                  display_name: string | null
                  email: string | null
                  class: string | null
                  created_at: string
                  user_roles: { role: string }[] | { role: string } | null
                }) => {
                  const userRole = getRole(u)
                  const isPending = userRole === 'PENDING'
                  
                  return (
                    <tr key={u.id} className={`border-b last:border-b-0 hover:bg-muted/30 ${isPending ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{u.display_name}</div>
                        <div className="text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        {u.class || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-inset ring-white/20
                          ${userRole === 'ADMIN' ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600' : ''}
                          ${userRole === 'APPROVED' ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : ''}
                          ${userRole === 'PENDING' ? 'bg-gradient-to-r from-amber-400 to-orange-500' : ''}
                          ${userRole === 'UNKNOWN' ? 'bg-gradient-to-r from-slate-400 to-slate-500' : ''}
                        `}>
                          {userRole}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {userRole === 'PENDING' && <ApproveButton userId={u.id} />}
                          {userRole === 'APPROVED' && <PromoteButton userId={u.id} />}
                          {userRole === 'ADMIN' && u.id !== user.id && <DemoteButton userId={u.id} />}
                          {u.id !== user.id && <DeleteUserButton userId={u.id} />}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {sortedUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                      {activeFilter ? `No users with role "${activeFilter}".` : 'No users found.'}
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

function getRole(u: { user_roles: { role: string }[] | { role: string } | null }): string {
  const roleObj = u.user_roles
  return Array.isArray(roleObj)
    ? (roleObj.length > 0 ? roleObj[0].role : 'UNKNOWN')
    : (roleObj?.role || 'UNKNOWN')
}