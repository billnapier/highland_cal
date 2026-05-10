import { createClient } from '@/lib/supabase/server'
import { ExternalLink, Calendar, MapPin } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface CustomLink {
  title: string;
  url: string;
}

export default async function AthleteProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const { id } = resolvedParams
  const supabase = await createClient()

  // Fetch the profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, class, outward_links, user_roles!inner(role)')
    .eq('id', id)
    .single()

  if (profileError || !profile) {
    notFound()
  }

  // Fetch attendance records to get the events this athlete is signed up for
  const { data: attendanceRecords, error: attendanceError } = await supabase
    .from('attendance')
    .select(`
      interest_level,
      attend_day,
      games (
        id,
        name,
        start_timestamp,
        end_timestamp,
        location,
        registration_url
      )
    `)
    .eq('user_id', id)
    .in('interest_level', ['REGISTERED', 'INTERESTED'])

  const links = profile.outward_links || {}
  const hasSocials = links.instagram || links.facebook || (links.customLinks && links.customLinks.length > 0)

  // Filter out any attendance records where the game might have been deleted but attendance remains
  const validAttendances = attendanceRecords?.filter(a => a.games) || []
  
  // Sort games by start date
  validAttendances.sort((a, b) => {
    // Check if a.games and b.games exist (though we just filtered for them, TypeScript might still complain if it thinks it could be null/an array)
    const gameA = Array.isArray(a.games) ? a.games[0] : a.games
    const gameB = Array.isArray(b.games) ? b.games[0] : b.games
    
    if (!gameA || !gameB) return 0
    return new Date(gameA.start_timestamp).getTime() - new Date(gameB.start_timestamp).getTime()
  })

  return (
    <main className="flex flex-1 flex-col p-8 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        
        {/* Profile Header */}
        <div className="bg-card text-card-foreground rounded-xl border shadow-sm p-8">
          <div className="flex flex-col md:flex-row justify-between items-start gap-6">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight">{profile.display_name || 'Anonymous Athlete'}</h1>
              {profile.class && (
                <div className="mt-2">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                    Class: {profile.class}
                  </span>
                </div>
              )}
            </div>
            
            {hasSocials && (
              <div className="flex flex-col items-end space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Links</h3>
                <div className="flex flex-wrap gap-2 justify-end">
                  {links.instagram && (
                    <a href={links.instagram} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <ExternalLink className="mr-2 h-4 w-4" /> Insta
                    </a>
                  )}
                  {links.facebook && (
                    <a href={links.facebook} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <ExternalLink className="mr-2 h-4 w-4" /> FB
                    </a>
                  )}
                </div>
                {links.customLinks && links.customLinks.length > 0 && (
                  <div className="flex flex-col items-end gap-2 mt-2">
                    {links.customLinks.map((link: CustomLink, idx: number) => (
                      <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline">
                        <ExternalLink className="mr-2 h-3 w-3" /> {link.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Schedule / Events Section */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold border-b pb-2">Athlete Schedule</h2>
          
          {attendanceError && (
            <p className="text-red-500">Failed to load schedule.</p>
          )}

          {!attendanceError && validAttendances.length === 0 && (
            <p className="text-muted-foreground italic">This athlete hasn't signed up for any upcoming events yet.</p>
          )}

          {!attendanceError && validAttendances.length > 0 && (
            <div className="grid gap-4">
              {validAttendances.map((record, idx) => {
                const game = Array.isArray(record.games) ? record.games[0] : record.games;
                if (!game) return null;

                const startDate = new Date(game.start_timestamp);
                const endDate = new Date(game.end_timestamp);
                const isSameDay = startDate.toDateString() === endDate.toDateString();
                const isTwoDay = endDate.getTime() - startDate.getTime() > 24 * 60 * 60 * 1000;
                
                let dayText = '';
                if (isTwoDay && record.attend_day && record.attend_day !== 'BOTH') {
                  dayText = record.attend_day === 'DAY_1' ? 'Day 1' : 'Day 2';
                }

                return (
                  <div key={`${game.id}-${idx}`} className="p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-bold">{game.name}</h3>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold
                            ${record.interest_level === 'REGISTERED' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}
                          `}>
                            {record.interest_level === 'REGISTERED' ? 'Registered' : 'Interested'}
                            {dayText && ` - ${dayText}`}
                          </span>
                        </div>
                        
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center">
                            <Calendar className="mr-2 h-4 w-4" />
                            <span>
                              {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                              {isSameDay 
                                ? '' 
                                : ` - ${endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`
                              }
                            </span>
                          </div>
                          {game.location && (
                            <div className="flex items-center">
                              <MapPin className="mr-2 h-4 w-4" />
                              <span>{game.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {game.registration_url && (
                        <a href={game.registration_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                          <ExternalLink className="mr-2 h-4 w-4" /> View Event
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        
        <div className="flex justify-center pt-8 border-t">
          <Link href="/roster" className={buttonVariants({ variant: 'ghost' })}>
            &larr; Back to Full Roster
          </Link>
        </div>
      </div>
    </main>
  )
}
