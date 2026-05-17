import { createClient } from '@/lib/supabase/server';
import LoginButton from '@/components/LoginButton';
import { Calendar, MapPin, ExternalLink, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { EventDateTime } from '@/components/EventDateTime';
import { CustomLink } from '@/lib/schemas';
import Image from 'next/image';

interface AttendanceRecord {
  interest_level: string;
  attend_day: string | null;
  profiles: { display_name: string | null } | null;
}

export default async function Home() {
  const supabase = await createClient();

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
  const heroImage = settingsMap['hero_image_url'] || null

  const { data: games, error } = await supabase
    .from('games')
    .select(`
      *,
      attendance (
        interest_level,
        attend_day,
        profiles (
          display_name
        )
      )
    `)
    .order('start_date', { ascending: true })
    .gte('start_date', new Date(new Date().getTime() - 86400000).toISOString().split('T')[0]);

  // Fetch all profiles for the roster
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, class, avatar_url, outward_links, user_roles!inner(role)')
    .in('user_roles.role', ['APPROVED', 'ADMIN'])
    .order('display_name', { ascending: true });

  return (
    <main className="flex flex-1 flex-col items-center p-4 md:p-8 max-w-6xl mx-auto w-full space-y-16 md:space-y-24">
      <section id="about" className="relative flex flex-col items-center justify-center w-full min-h-[60vh] rounded-3xl overflow-hidden mb-12 border shadow-2xl">
        {heroImage ? (
          <>
            <Image src={heroImage} alt={`${clubName} Hero`} fill className="object-cover absolute inset-0 z-0" priority />
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/50 to-black/30 backdrop-blur-[2px]" />
          </>
        ) : (
          <div className="absolute inset-0 z-0 bg-gradient-to-br from-green-900 via-emerald-800 to-teal-900" />
        )}
        
        <div className="relative z-20 flex flex-col items-center space-y-8 text-center p-6 sm:p-12 w-full max-w-4xl mx-auto my-12">
          <div className="space-y-4">
            <h1 className="text-5xl font-extrabold tracking-tighter sm:text-6xl md:text-7xl lg:text-8xl text-white drop-shadow-lg">
              {clubName}
            </h1>
          </div>
          
          <div className="backdrop-blur-md bg-black/40 border border-white/20 p-6 sm:p-8 rounded-2xl text-gray-100 shadow-xl max-w-[800px] text-left md:text-center w-full">
            <p className="leading-relaxed md:text-lg">
              {clubBlurb}
            </p>
          </div>

          <div className="flex flex-col space-y-4 items-center justify-center pt-4 w-full">
            <div className="flex flex-col sm:flex-row gap-4 items-center w-full sm:w-auto">
              <LoginButton text="Apply to Join" variant="default" className="text-lg px-8 py-6 rounded-full shadow-lg hover:scale-105 transition-transform w-full sm:w-auto" />
              <Link href="/api/calendar.ics" prefetch={false} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'text-lg px-8 py-6 rounded-full bg-white/10 text-white hover:bg-white/20 border-white/30 backdrop-blur-sm hover:scale-105 transition-transform w-full sm:w-auto' })}>
                <Calendar className="mr-2 h-5 w-5" /> Subscribe to Calendar
              </Link>
            </div>
            <div className="mt-4 text-sm text-gray-300 flex items-center gap-2 bg-black/40 px-5 py-2 rounded-full border border-white/10 backdrop-blur-md">
              Already a member? 
              <LoginButton text="Log in" variant="link" className="px-0 font-bold text-white hover:text-gray-200" />
            </div>
          </div>
        </div>
      </section>

      {/* Schedule Section */}
      <section id="schedule" className="w-full space-y-6 scroll-m-20">
        <div className="border-b pb-4">
          <h2 className="text-3xl font-bold tracking-tight">Upcoming Events</h2>
          <p className="text-muted-foreground mt-1">Practices and official games on our radar.</p>
        </div>
        
        {error && (
          <p className="text-red-500">Error loading events. Please try again later.</p>
        )}

        {!error && games?.length === 0 && (
          <p className="text-gray-500 italic">No upcoming events scheduled at this time.</p>
        )}

        {!error && games && games.length > 0 && (
          <div className="grid gap-4">
            {games.map((game) => {
              const startDate = new Date(game.start_date + 'T00:00:00');
              const isTwoDay = game.is_two_day;
              const endDate = new Date(startDate);
              if (isTwoDay) endDate.setDate(endDate.getDate() + 1);
              
              const attendees = game.attendance?.filter((a: AttendanceRecord) => a.interest_level === 'REGISTERED' || a.interest_level === 'INTERESTED') || [];
              const registeredAthletes = attendees.filter((a: AttendanceRecord) => a.interest_level === 'REGISTERED');
              const interestedAthletes = attendees.filter((a: AttendanceRecord) => a.interest_level === 'INTERESTED');
              
              return (
                <div key={game.id} className="p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
                  <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold">{game.name}</h3>
                        {game.type === 'PRACTICE' && (
                          <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-inset ring-purple-700/10 dark:bg-purple-900 dark:text-purple-200 dark:ring-purple-500/20">
                            Practice
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center text-muted-foreground text-sm">
                          <EventDateTime 
                            startDateStr={game.start_date}
                            isTwoDay={game.is_two_day}
                            type={game.type}
                            startTime={game.start_time}
                            endTime={game.end_time}
                          />
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
                        <ExternalLink className="mr-2 h-4 w-4" /> Register
                      </a>
                    )}
                  </div>
                  
                  {attendees.length > 0 && (
                    <div className="mt-4 pt-4 border-t text-sm">
                      <h4 className="font-semibold mb-2 text-muted-foreground">Athletes Attending</h4>
                      <div className="flex flex-wrap gap-2">
                        {registeredAthletes.map((a: AttendanceRecord, idx: number) => {
                          const name = a.profiles?.display_name || 'Anonymous';
                          let daySuffix = '';
                          if (isTwoDay && a.attend_day && a.attend_day !== 'BOTH') {
                            daySuffix = a.attend_day === 'DAY_1' ? ' (Day 1)' : ' (Day 2)';
                          }
                          return (
                            <span key={`reg-${idx}`} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900 dark:text-blue-200 dark:ring-blue-500/20">
                              {name}{daySuffix}
                            </span>
                          );
                        })}
                        {interestedAthletes.map((a: AttendanceRecord, idx: number) => {
                          const name = a.profiles?.display_name || 'Anonymous';
                          return (
                            <span key={`int-${idx}`} className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600/20">
                              {name} (Interested)
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Roster Section */}
      <section id="roster" className="w-full space-y-6 scroll-m-20 pb-12">
        <div className="border-b pb-4">
          <h2 className="text-3xl font-bold tracking-tight">Club Roster</h2>
          <p className="text-muted-foreground mt-1">Meet the athletes of {clubName}.</p>
        </div>

        {profilesError && (
          <div className="text-red-500">Failed to load roster.</div>
        )}

        {!profilesError && profiles && profiles.length === 0 && (
          <div className="text-center text-muted-foreground italic mt-8">
            No athletes found.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
          {profiles?.map((profile) => {
            const links = profile.outward_links || {}
            const hasSocials = links.instagram || links.facebook || (links.customLinks && links.customLinks.length > 0)
            
            return (
              <div key={profile.id} className="group relative bg-card text-card-foreground rounded-2xl border shadow-sm flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl overflow-hidden">
                <div className="h-20 w-full bg-gradient-to-r from-muted to-secondary/50 border-b relative"></div>
                <div className="p-5 pt-0 flex-1 flex flex-col">
                  <div className="flex justify-between items-start gap-3 -mt-10 mb-3 relative z-10">
                    <div className="flex flex-col items-start gap-2">
                      {profile.avatar_url ? (
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-background shadow-sm bg-background">
                          <Image src={profile.avatar_url} alt={profile.display_name || 'Profile'} fill className="object-cover" sizes="80px" />
                        </div>
                      ) : (
                        <div className="relative h-20 w-20 shrink-0 rounded-full border-4 border-background shadow-sm bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground">
                          {(profile.display_name || 'A')[0]}
                        </div>
                      )}
                      <h3 className="text-xl font-bold line-clamp-1 mt-1">
                        <Link href={`/roster/${profile.id}`} className="hover:underline hover:text-primary transition-colors">
                          {profile.display_name || 'Anonymous Athlete'}
                        </Link>
                      </h3>
                    </div>
                    {profile.class && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20 whitespace-nowrap shrink-0 mt-12 shadow-sm">
                        {profile.class}
                      </span>
                    )}
                  </div>
                  
                  {hasSocials ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {links.instagram && (
                        <a href={links.instagram} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "icon" })} title="Instagram" aria-label="Instagram">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                        </a>
                      )}
                      {links.facebook && (
                        <a href={links.facebook} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "icon" })} title="Facebook" aria-label="Facebook">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                        </a>
                      )}
                      {links.customLinks && links.customLinks.length > 0 && (
                        links.customLinks.map((link: CustomLink, idx: number) => (
                          <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })} title={link.title}>
                            <ExternalLink className="mr-2 h-3 w-3" />
                            {link.title.length > 10 ? link.title.substring(0, 10) + '...' : link.title}
                          </a>
                        ))
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-muted-foreground italic">
                      No public links
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t">
                    <Link href={`/roster/${profile.id}`} className="text-sm font-medium text-primary hover:underline inline-flex items-center">
                      View full profile <ChevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  );
}
