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

  const settingsMap = settingsData?.reduce((acc: any, setting: any) => {
    acc[setting.key] = setting.value
    return acc
  }, {}) || {}

  const clubName = settingsMap['club_name'] || 'Highland Cal'
  const clubBlurb = settingsMap['club_blurb'] || 'We are a community of athletes dedicated to the traditional Scottish Highland Games. Whether you are a seasoned A-class thrower or looking to try the caber toss for the very first time, Highland Cal is where we organize practices, coordinate game attendance, and support each other on the field.'

  return (
    <main className="flex flex-1 flex-col p-8">
      <div className="mx-auto w-full max-w-5xl space-y-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage settings, approve registrations, and assign roles.</p>
        </div>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">Site Settings</h2>
          <div className="rounded-md border bg-card text-card-foreground shadow-sm p-6">
            <AdminSettings initialClubName={clubName} initialClubBlurb={clubBlurb} />
          </div>
        </section>
        
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">User Management</h2>
          <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
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
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                          ${role === 'ADMIN' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' : ''}
                          ${role === 'APPROVED' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : ''}
                          ${role === 'PENDING' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' : ''}
                          ${role === 'UNKNOWN' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' : ''}
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
