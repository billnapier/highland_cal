import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/ProfileForm'

export default async function ProfilePage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  const user = data?.user

  if (error || !user) {
    redirect('/')
  }

  // Fetch the user's profile and role in a single joined query to reduce latency
  const { data: profileData } = await supabase
    .from('profiles')
    .select('class, avatar_url, outward_links, vanity_name, user_roles(role)')
    .eq('id', user.id)
    .single()

  const profileDataCast = profileData as {
    class: string | null;
    avatar_url: string | null;
    outward_links: unknown;
    vanity_name: string | null;
    user_roles: { role: string } | { role: string }[] | null;
  } | null;

  const roleRecord = profileDataCast?.user_roles;
  const role = (Array.isArray(roleRecord) ? roleRecord[0]?.role : roleRecord?.role) || 'UNKNOWN';
  const canHaveVanity = role === 'APPROVED' || role === 'ADMIN';

  return (
    <main className="flex flex-1 flex-col p-8 bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/80 dark:from-slate-950 dark:via-blue-950/20 dark:to-indigo-950/30 min-h-[calc(100vh-4rem)]">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">Personal Profile</h1>
          <p className="text-muted-foreground mt-2">
            Manage your public identity, competition class, and social media links.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-card-foreground shadow-xl p-6">
          <ProfileForm initialData={profileData || {}} canHaveVanity={canHaveVanity} />
        </div>
      </div>
    </main>
  )
}
