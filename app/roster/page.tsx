import { createClient } from '@/lib/supabase/server'
import { ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
interface CustomLink {
  title: string;
  url: string;
}

export default async function RosterPage() {
  const supabase = await createClient()

  // Fetch all profiles
  const { data: profiles, error } = await supabase
    .from('Profiles')
    .select('id, display_name, class, outward_links, User_Roles!inner(role)')
    .in('User_Roles.role', ['APPROVED', 'ADMIN'])
    .order('display_name', { ascending: true })

  return (
    <main className="flex flex-1 flex-col p-8 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Club Roster</h1>
          <p className="text-xl text-muted-foreground">
            Meet the athletes of Highland Cal.
          </p>
        </div>

        {error && (
          <div className="text-red-500 text-center">Failed to load roster.</div>
        )}

        {!error && profiles && profiles.length === 0 && (
          <div className="text-center text-muted-foreground italic mt-12">
            No athletes found.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-8">
          {profiles?.map((profile) => {
            const links = profile.outward_links || {}
            const hasSocials = links.instagram || links.facebook || (links.customLinks && links.customLinks.length > 0)
            
            return (
              <div key={profile.id} className="bg-card text-card-foreground rounded-xl border shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-bold line-clamp-2">{profile.display_name || 'Anonymous Athlete'}</h2>
                    {profile.class && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300 whitespace-nowrap ml-2">
                        {profile.class}
                      </span>
                    )}
                  </div>
                  
                  {hasSocials ? (
                    <div className="space-y-3 pt-4 border-t">
                      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Links</h3>
                      <div className="flex flex-wrap gap-2">
                        {links.instagram && (
                          <a href={links.instagram} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Insta
                          </a>
                        )}
                        {links.facebook && (
                          <a href={links.facebook} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            FB
                          </a>
                        )}
                      </div>
                      
                      {links.customLinks && links.customLinks.length > 0 && (
                        <div className="flex flex-col gap-2 mt-2">
                          {links.customLinks.map((link: CustomLink, idx: number) => (
                            <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline">
                              <ExternalLink className="mr-2 h-3 w-3" />
                              {link.title}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pt-4 border-t text-sm text-muted-foreground italic">
                      No public links provided.
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
