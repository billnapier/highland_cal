import { createClient } from '@/lib/supabase/server'
import { ExternalLink, Calendar, MapPin } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CustomLink } from '@/lib/schemas'
import Image from 'next/image'

export default async function AthleteProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const { id } = resolvedParams
  const supabase = await createClient()

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  // ⚡ Bolt: Consolidated sequential profile (vanity vs id) and attendance queries into a single concurrent query to fix N+1 waterfall and improve TTFB
  let query = supabase
    .from('profiles')
    .select(`
      id, display_name, class, avatar_url, outward_links, vanity_name, user_roles!inner(role),
      attendance(
        interest_level,
        attend_day,
        games (
          id,
          name,
          start_date,
          is_two_day,
          location,
          registration_url
        )
      )
    `)

  if (isUuid) {
    query = query.or(`id.eq.${id},vanity_name.eq.${id}`)
  } else {
    query = query.eq('vanity_name', id)
  }

  const { data: profileData, error: profileError } = await query.maybeSingle()

  if (profileError || !profileData) {
    notFound()
  }

  const profile = profileData

  // Redirect if they accessed via UUID but have a vanity_name configured, unless vanity_name was what they used
  if (isUuid && profile.vanity_name && profile.vanity_name !== id) {
    redirect(`/roster/${profile.vanity_name}`)
  }

  const links = profile.outward_links || {}

  // Filter out any attendance records where the game might have been deleted but attendance remains, and filter by interest level in memory
  const attendanceRecords = profile.attendance || []
  const attendanceError = profileError
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validAttendances = (attendanceRecords as any[]).filter(a =>
    a.games && (a.interest_level === 'REGISTERED' || a.interest_level === 'INTERESTED')
  ) || []
  
  // Sort games by start date
  validAttendances.sort((a, b) => {
    // Check if a.games and b.games exist (though we just filtered for them, TypeScript might still complain if it thinks it could be null/an array)
    const gameA = Array.isArray(a.games) ? a.games[0] : a.games
    const gameB = Array.isArray(b.games) ? b.games[0] : b.games
    
    if (!gameA || !gameB) return 0
    return new Date(gameA.start_date).getTime() - new Date(gameB.start_date).getTime()
  })

  return (
    <main className="flex flex-1 flex-col p-8 min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/80 dark:from-slate-950 dark:via-blue-950/20 dark:to-indigo-950/30">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Athlete Card (Left Column) */}
          <div className="md:col-span-1">
            <div className="relative w-full aspect-[4/5] bg-muted overflow-hidden rounded-3xl border border-slate-200/60 dark:border-slate-800/60 shadow-xl">
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={profile.display_name || 'Profile'} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" priority />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-8xl font-bold text-muted-foreground/30 bg-secondary/20">
                  {(profile.display_name?.[0] || 'A').toUpperCase()}
                </div>
              )}
              {profile.class && (
                <div className="absolute top-4 right-4 z-10">
                  <span className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-4 py-1 text-sm font-black shadow-md border-2 border-background/50">
                    {profile.class}
                  </span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
              <div className="absolute bottom-0 inset-x-0 p-6">
                <h1 className="text-3xl font-extrabold text-white drop-shadow-md">
                  {profile.display_name || 'Anonymous Athlete'}
                </h1>
              </div>
            </div>
            
            <div className="mt-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-card-foreground rounded-2xl border border-slate-200/60 dark:border-slate-800/60 shadow-md p-6">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Athlete Links</h3>
              <div className="flex flex-col gap-3">
                <a href={`/api/calendar.ics?id=${profile.vanity_name || profile.id}`} className={buttonVariants({ variant: "outline", className: "w-full justify-start" })}>
                  <Calendar className="mr-2 h-4 w-4" /> Subscribe to Schedule
                </a>
                  {links.instagram && (
                    <a href={links.instagram} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", className: "w-full justify-start" })}>
                      <ExternalLink className="mr-2 h-4 w-4" /> Instagram
                    </a>
                  )}
                  {links.facebook && (
                    <a href={links.facebook} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", className: "w-full justify-start" })}>
                      <ExternalLink className="mr-2 h-4 w-4" /> Facebook
                    </a>
                  )}
                {links.customLinks?.map((link: CustomLink, idx: number) => (
                  <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline p-2 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    <ExternalLink className="mr-2 h-4 w-4 shrink-0" /> <span className="truncate">{link.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Details & Schedule (Right Column) */}
          <div className="md:col-span-2 space-y-8">
            {/* Schedule / Events Section */}
            <div className="space-y-4">
              <h2 className="text-3xl font-extrabold border-b border-slate-200 dark:border-slate-800 pb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">Athlete Schedule</h2>
          
          {attendanceError && (
            <p className="text-red-500">Failed to load schedule.</p>
          )}

          {!attendanceError && validAttendances.length === 0 && (
            <p className="text-muted-foreground italic">This athlete hasn&apos;t signed up for any upcoming events yet.</p>
          )}

          {!attendanceError && validAttendances.length > 0 && (
            <div className="grid gap-4">
              {validAttendances.map((record, idx) => {
                const game = Array.isArray(record.games) ? record.games[0] : record.games;
                if (!game) return null;

                const startDate = new Date(game.start_date + 'T00:00:00');
                const isTwoDay = game.is_two_day;
                const isSameDay = !isTwoDay;
                const endDate = new Date(startDate);
                if (isTwoDay) endDate.setDate(endDate.getDate() + 1);
                
                let dayText = '';
                if (isTwoDay && record.attend_day && record.attend_day !== 'BOTH') {
                  dayText = record.attend_day === 'DAY_1' ? 'Day 1' : 'Day 2';
                }

                return (
                  <div key={`${game.id}-${idx}`} className="p-6 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-card-foreground">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-bold">{game.name}</h3>
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-inset ring-white/20
                            ${record.interest_level === 'REGISTERED' ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-slate-400 to-slate-500'}
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
                              {!isSameDay && ` - ${endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`}
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
        </div>
        </div>
        
        <div className="flex justify-center pt-8 border-t border-slate-200/60 dark:border-slate-800/60">
          <Link href="/#roster" className="group inline-flex items-center justify-center rounded-full bg-white/80 dark:bg-slate-900/80 px-6 py-3 text-sm font-bold text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-inset ring-slate-200/60 dark:ring-slate-800/60 backdrop-blur-xl transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 hover:shadow-md">
            <span className="mr-2 transition-transform group-hover:-translate-x-1">&larr;</span> Back to Full Roster
          </Link>
        </div>
      </div>
    </main>
  )
}
