import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/ProfileForm'

export default async function ProfilePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Fetch the user's profile
  const { data: profileData } = await supabase
    .from('Profiles')
    .select('class, outward_links')
    .eq('id', user.id)
    .single()

  return (
    <main className="flex flex-1 flex-col p-8">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Personal Profile</h1>
          <p className="text-muted-foreground mt-2">
            Manage your public identity, competition class, and social media links.
          </p>
        </div>

        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <ProfileForm initialData={profileData || {}} />
        </div>
      </div>
    </main>
  )
}
