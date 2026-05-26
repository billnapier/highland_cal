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
    <main className="flex flex-1 flex-col items-center p-4 md:p-8 bg-gradient-to-br from-emerald-50/20 via-slate-50 to-amber-50/20 dark:from-slate-950 dark:via-emerald-950/5 dark:to-slate-950 w-full min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-6xl mx-auto space-y-16 md:space-y-24">
        
        {/* Two-Column Hero / Intro Section */}
        <section id="about" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mb-12">
          {/* Column 1: Eye-Catching Welcome & Club Purpose */}
          <div className="lg:col-span-5 flex flex-col justify-between p-6 md:p-10 rounded-3xl border border-emerald-100/50 dark:border-emerald-950/20 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl space-y-6 md:space-y-8">
            <div className="space-y-4 md:space-y-6">
              <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20">
                Welcome to the Clan
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
                Discover the Strength & Tradition of{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-700 to-emerald-900 dark:from-emerald-400 dark:to-emerald-200">
                  Highland Athletics
                </span>
              </h2>
              <p className="text-slate-600 dark:text-slate-350 leading-relaxed text-sm sm:text-base">
                Highland Cal is the central hub for our traditional Scottish Highland Games club. We bring together athletes, fans, and organizers to keep the spirit of the heavy events alive.
              </p>
              
              <ul className="space-y-3.5 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
                  </div>
                  <span><strong>Find Local Events</strong>: View schedules, locations, and directions for upcoming games.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
                  </div>
                  <span><strong>Meet Our Competitors</strong>: Browse the active club roster of approved heavy throwers.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
                  </div>
                  <span><strong>Track Who is Throwing</strong>: Coordinate roster attendance to see who is representing our club.</span>
                </li>
              </ul>
            </div>
            
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-3 items-center">
              <LoginButton text="Apply to Join" variant="default" className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-bold px-6 py-5 rounded-xl shadow-md shadow-emerald-600/10 hover:scale-[1.02] transition-all cursor-pointer text-sm" />
              <Link href="#schedule" className="inline-flex items-center justify-center font-bold px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm">
                Explore Events
              </Link>
            </div>
          </div>

          {/* Column 2: The Club Custom Image & Banner Card */}
          <div className="lg:col-span-7 relative flex flex-col justify-end rounded-3xl overflow-hidden min-h-[450px] lg:min-h-none border border-slate-200/40 dark:border-slate-800/40 shadow-2xl group">
            {heroImage ? (
              <>
                <Image src={heroImage} alt={`${clubName} Hero`} fill className="object-cover absolute inset-0 z-0 group-hover:scale-[1.02] transition-transform duration-700 ease-out" priority />
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/55 to-black/25 backdrop-blur-[1px]" />
              </>
            ) : (
              <div className="absolute inset-0 z-0 bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-900" />
            )}
            
            <div className="relative z-20 flex flex-col justify-end p-6 sm:p-10 md:p-12 h-full text-left space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tighter text-white drop-shadow-md bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-amber-200">
                  {clubName}
                </h1>
              </div>
              
              <div className="backdrop-blur-md bg-black/45 border border-white/10 p-5 sm:p-6 rounded-2xl text-gray-200 shadow-xl max-w-2xl">
                <p className="leading-relaxed text-sm sm:text-base text-slate-100/90 font-medium">
                  {clubBlurb}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Link href="/api/calendar.ics" prefetch={false} className="inline-flex items-center justify-center font-bold px-6 py-3 rounded-xl bg-white/15 text-white hover:bg-white/25 border border-white/20 backdrop-blur-sm shadow-md hover:scale-[1.02] transition-all text-sm">
                  <Calendar className="mr-2 h-4 w-4 text-amber-400" /> Subscribe to Calendar
                </Link>
                <div className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md text-xs sm:text-sm text-gray-300">
                  <span>Already a member?</span>
                  <LoginButton text="Log in" variant="link" className="px-0 font-bold text-white hover:text-amber-300 transition-colors" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Schedule & Sidebar Section */}
        <section id="schedule" className="w-full space-y-6 scroll-m-20">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-700 to-teal-600 dark:from-emerald-400 dark:to-teal-300 drop-shadow-sm">Upcoming Events</h2>
            <p className="text-muted-foreground mt-1">Practices and official games on our radar.</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Events (spans 8 columns) */}
            <div className="lg:col-span-8 space-y-4">
              {error && (
                <p className="text-red-500">Error loading events. Please try again later.</p>
              )}

              {!error && games?.length === 0 && (
                <p className="text-gray-500 italic">No upcoming events scheduled at this time.</p>
              )}

              {!error && games && games.length > 0 && (
                <div className="grid gap-4">
                  {games.map((game) => {
                    const isTwoDay = game.is_two_day;
                    const attendees = game.attendance?.filter((a: AttendanceRecord) => a.interest_level === 'REGISTERED' || a.interest_level === 'INTERESTED') || [];
                    const registeredAthletes = attendees.filter((a: AttendanceRecord) => a.interest_level === 'REGISTERED');
                    const interestedAthletes = attendees.filter((a: AttendanceRecord) => a.interest_level === 'INTERESTED');
                    
                    return (
                      <div key={game.id} className="p-6 border border-slate-200/50 dark:border-slate-800/40 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-500/40 dark:hover:border-emerald-500/40 transition-all duration-300 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl text-card-foreground">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                          <div>
                            <div className="flex items-center gap-2.5 mb-2">
                              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{game.name}</h3>
                              {game.type === 'PRACTICE' ? (
                                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-1 text-xs font-black text-white shadow-sm ring-1 ring-inset ring-white/10 uppercase tracking-wider">
                                  Practice
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1 text-xs font-black text-white shadow-sm ring-1 ring-inset ring-white/10 uppercase tracking-wider">
                                  Game
                                </span>
                              )}
                            </div>
                            <div className="space-y-1.5 text-sm text-muted-foreground">
                              <div className="flex items-center text-slate-600 dark:text-slate-350">
                                <Calendar className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <EventDateTime 
                                  startDateStr={game.start_date}
                                  isTwoDay={game.is_two_day}
                                  type={game.type}
                                  startTime={game.start_time}
                                  endTime={game.end_time}
                                />
                              </div>
                              {game.location && (
                                <div className="flex items-center text-slate-600 dark:text-slate-350">
                                  <MapPin className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  <span>{game.location}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {game.registration_url && (
                            <a href={game.registration_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center font-bold px-4 py-2 text-xs rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Register
                            </a>
                          )}
                        </div>
                        
                        {attendees.length > 0 && (
                          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 text-sm">
                            <h4 className="font-semibold mb-2.5 text-slate-500 dark:text-slate-400">Athletes Attending</h4>
                            <div className="flex flex-wrap gap-2">
                              {registeredAthletes.map((a: AttendanceRecord, idx: number) => {
                                const name = a.profiles?.display_name || 'Anonymous';
                                let daySuffix = '';
                                if (isTwoDay && a.attend_day && a.attend_day !== 'BOTH') {
                                  daySuffix = a.attend_day === 'DAY_1' ? ' (Day 1)' : ' (Day 2)';
                                }
                                return (
                                  <span key={`reg-${idx}`} className="inline-flex items-center rounded-full bg-gradient-to-r from-emerald-600 to-emerald-800 dark:from-emerald-500 dark:to-emerald-700 px-3 py-1 text-xs font-bold text-white shadow-sm">
                                    {name}{daySuffix}
                                  </span>
                                );
                              })}
                              {interestedAthletes.map((a: AttendanceRecord, idx: number) => {
                                const name = a.profiles?.display_name || 'Anonymous';
                                return (
                                  <span key={`int-${idx}`} className="inline-flex items-center rounded-full bg-gradient-to-r from-slate-400/80 to-slate-500/80 dark:from-slate-700/80 dark:to-slate-800/80 px-3 py-1 text-xs font-bold text-slate-100 dark:text-slate-300 shadow-sm">
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
            </div>

            {/* Right Column: Beautiful Dynamic Sidebar (spans 4 columns) */}
            <div className="lg:col-span-4 space-y-6">
              {/* Sidebar Widget 1: Who's Throwing Next? */}
              <div className="p-6 border border-emerald-100/50 dark:border-emerald-950/20 rounded-3xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 dark:from-emerald-950/20 dark:to-transparent backdrop-blur-xl shadow-lg space-y-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center rounded-full bg-emerald-100/60 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 text-2xs font-extrabold uppercase tracking-widest">
                    Featured Lineup
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Who&apos;s Throwing Next?</h3>
                </div>
                
                {(() => {
                  // Find next game with registered athletes
                  const nextGame = games?.find(g => {
                    const hasRegistered = g.attendance?.some((a: AttendanceRecord) => a.interest_level === 'REGISTERED');
                    return hasRegistered;
                  });
                  
                  if (nextGame) {
                    const registered = nextGame.attendance?.filter((a: AttendanceRecord) => a.interest_level === 'REGISTERED') || [];
                    return (
                      <div className="space-y-4">
                        <div className="bg-white/60 dark:bg-slate-900/65 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                          <p className="font-extrabold text-sm text-emerald-700 dark:text-emerald-400 line-clamp-1">{nextGame.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center">
                            <MapPin className="h-3 w-3 mr-1 text-slate-450 shrink-0" /> {nextGame.location || "Local Games"}
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Attending Athletes:</p>
                          <div className="grid grid-cols-1 gap-2">
                            {registered.map((a: AttendanceRecord, idx: number) => {
                              const athleteProfile = profiles?.find(p => p.display_name === a.profiles?.display_name);
                              return (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/40 dark:hover:bg-slate-800/40 transition-colors">
                                  <div className="flex items-center gap-2.5">
                                    {athleteProfile?.avatar_url ? (
                                      <div className="relative h-7 w-7 rounded-full overflow-hidden shrink-0">
                                        <Image src={athleteProfile.avatar_url} alt={a.profiles?.display_name || 'Athlete'} fill className="object-cover" />
                                      </div>
                                    ) : (
                                      <div className="h-7 w-7 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xs font-extrabold shrink-0">
                                        {(a.profiles?.display_name?.[0] || 'A').toUpperCase()}
                                      </div>
                                    )}
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-350">{a.profiles?.display_name || 'Anonymous'}</span>
                                  </div>
                                  {athleteProfile && (
                                    <Link href={`/roster/${athleteProfile.id}`} className="text-2xs font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5">
                                      Profile <ChevronRight className="h-3 w-3" />
                                    </Link>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div className="py-4 text-center">
                        <p className="text-xs text-muted-foreground italic">No athletes registered for upcoming games yet.</p>
                        <p className="text-2xs text-emerald-600 dark:text-emerald-405 font-bold mt-2">Become the first to sign up!</p>
                      </div>
                    );
                  }
                })()}
              </div>

              {/* Sidebar Widget 3: Club Quick Stats */}
              <div className="p-6 border border-slate-200/50 dark:border-slate-800/40 rounded-3xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shadow-sm space-y-4">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Club Stats</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl text-center border border-slate-100 dark:border-slate-900">
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-450">{profiles?.length || 0}</div>
                    <div className="text-2xs text-muted-foreground font-semibold mt-0.5">Approved Athletes</div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl text-center border border-slate-100 dark:border-slate-900">
                    <div className="text-2xl font-black text-amber-500 dark:text-amber-400">{games?.length || 0}</div>
                    <div className="text-2xs text-muted-foreground font-semibold mt-0.5">Upcoming Events</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Roster Section */}
        <section id="roster" className="w-full space-y-6 scroll-m-20 pb-12">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <h2 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-700 to-teal-650 dark:from-emerald-400 dark:to-teal-300 drop-shadow-sm">Club Roster</h2>
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            {profiles?.map((profile) => {
              const links = profile.outward_links || {}
              const hasSocials = links.instagram || links.facebook || (links.customLinks && links.customLinks.length > 0)
              
              return (
                <div key={profile.id} className="group relative bg-card text-card-foreground rounded-3xl border border-slate-200/50 dark:border-slate-800/40 shadow-sm flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl overflow-hidden hover:border-emerald-500/50 dark:hover:border-emerald-500/50">
                  {/* Master Clickable Link Overlay */}
                  <Link href={`/roster/${profile.id}`} className="absolute inset-0 z-10" aria-label={`View ${profile.display_name}'s profile`} />
                  
                  <div className="relative w-full aspect-[4/5] bg-slate-100 dark:bg-slate-900 overflow-hidden">
                    {profile.avatar_url ? (
                      <Image src={profile.avatar_url} alt={profile.display_name || 'Profile'} fill className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-6xl font-bold text-muted-foreground/35 bg-emerald-500/5">
                        {(profile.display_name?.[0] || 'A').toUpperCase()}
                      </div>
                    )}
                    
                    {profile.class && (
                      <div className="absolute top-4 right-4 z-20">
                        <span className="inline-flex items-center rounded-full bg-emerald-600 dark:bg-emerald-500 text-white px-3 py-1 text-xs font-black shadow-md border border-white/20">
                          {profile.class}
                        </span>
                      </div>
                    )}
                    
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/45 to-transparent z-10"></div>
                    
                    <div className="absolute bottom-0 inset-x-0 p-5 z-20">
                      <h3 className="text-2xl font-extrabold text-white drop-shadow-md line-clamp-1">
                        {profile.display_name || 'Anonymous Athlete'}
                      </h3>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between relative z-20 pointer-events-none">
                    {hasSocials ? (
                      <div className="flex flex-wrap gap-2 pointer-events-auto">
                        {links.instagram && (
                          <a href={links.instagram} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "icon", className: "h-8 w-8 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600 transition-colors" })} title="Instagram" aria-label="Instagram">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                          </a>
                        )}
                        {links.facebook && (
                          <a href={links.facebook} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "icon", className: "h-8 w-8 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600 transition-colors" })} title="Facebook" aria-label="Facebook">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                          </a>
                        )}
                        {links.customLinks && links.customLinks.length > 0 && (
                          links.customLinks.map((link: CustomLink, idx: number) => (
                            <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary", size: "sm", className: "h-8 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600 transition-colors" })} title={link.title}>
                              <ExternalLink className="mr-1.5 h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                              {link.title}
                            </a>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        No public links
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 w-full">
                      <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 inline-flex items-center w-full justify-between uppercase tracking-wider transition-colors">
                        View Athlete&apos;s Info <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform duration-200" />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
