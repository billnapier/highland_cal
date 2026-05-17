import { createClient } from '@/lib/supabase/server';
import LoginButton from '@/components/LoginButton';
import { Calendar, MapPin, ExternalLink, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

interface AttendanceRecord {
  interest_level: string;
  attend_day: string | null;
  profiles: { display_name: string | null } | null;
}

interface CustomLink {
  title: string;
  url: string;
}

export default async function Home() {
  const supabase = await createClient();
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
    .select('id, display_name, class, outward_links, user_roles!inner(role)')
    .in('user_roles.role', ['APPROVED', 'ADMIN'])
    .order('display_name', { ascending: true });

  return (
    <main className="flex flex-1 flex-col items-center p-8 max-w-5xl mx-auto w-full space-y-24">
      {/* Hero Section */}
      <section id="about" className="flex flex-col items-center space-y-8 text-center w-full pt-12">
        <div className="space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
            Highland Cal
          </h1>
          <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
            The official schedule and roster for the Highland Cal throwing community.
          </p>
        </div>
        
        <div className="max-w-[800px] text-left md:text-center text-muted-foreground bg-secondary/20 p-6 rounded-2xl">
          <p className="leading-relaxed">
            We are a community of athletes dedicated to the traditional Scottish Highland Games. 
            Whether you are a seasoned A-class thrower or looking to try the caber toss for the very first time, 
            Highland Cal is where we organize practices, coordinate game attendance, and support each other on the field.
          </p>
        </div>

        <div className="flex flex-col space-y-4 items-center justify-center mt-4 w-full">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <LoginButton text="Apply to Join" variant="default" />
            <Link href="/api/calendar.ics" prefetch={false} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              <Calendar className="mr-2 h-4 w-4" /> Subscribe to Calendar
            </Link>
          </div>
          <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
            Already a member? 
            <LoginButton text="Log in" variant="link" className="px-0 font-semibold text-primary" />
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
              const isSameDay = !isTwoDay;
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
                        <div className="flex items-center">
                          <Calendar className="mr-2 h-4 w-4" />
                          <span>
                            {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            {game.type === 'PRACTICE' && game.start_time ? ` from ${game.start_time}` : ''}
                            {game.type === 'PRACTICE' && game.end_time ? ` to ${game.end_time}` : ''}
                            {game.type !== 'PRACTICE' && !isSameDay && ` - ${endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`}
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
          <p className="text-muted-foreground mt-1">Meet the athletes of Highland Cal.</p>
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
              <div key={profile.id} className="bg-card text-card-foreground rounded-xl border shadow-sm flex flex-col transition-all hover:shadow-md">
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xl font-bold line-clamp-1">
                      <Link href={`/roster/${profile.id}`} className="hover:underline">
                        {profile.display_name || 'Anonymous Athlete'}
                      </Link>
                    </h3>
                    {profile.class && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-300 whitespace-nowrap ml-2 shrink-0">
                        {profile.class}
                      </span>
                    )}
                  </div>
                  
                  {hasSocials ? (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {links.instagram && (
                        <a href={links.instagram} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "icon" })} title="Instagram">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                        </a>
                      )}
                      {links.facebook && (
                        <a href={links.facebook} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "icon" })} title="Facebook">
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
