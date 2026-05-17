import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MapPin } from 'lucide-react'
import DeleteEventButton from '@/components/DeleteEventButton'
import { CreateEventModal, EditEventModal } from '@/components/EventModals'
import AttendanceManager from '@/components/AttendanceManager'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import ApplicationForm from '@/components/ApplicationForm'
import { EventDateTime } from '@/components/EventDateTime'

const PAGE_TITLE = "Dashboard"
const GAME_TYPES = { PRACTICE: 'Practice' }
const CARD_CLASSES = "p-6 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl text-card-foreground"
const ROLE_BADGE_CLASSES: Record<string, string> = {
  ADMIN: 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white border-purple-400/30',
  APPROVED: 'bg-gradient-to-r from-emerald-400 to-teal-500 text-white border-emerald-400/30',
  PENDING: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white border-amber-400/30',
  UNKNOWN: 'bg-gradient-to-r from-slate-400 to-slate-500 text-white border-slate-400/30'
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Fetch the user's role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  // Fetch the user's profile
  const { data: profileData } = await supabase
    .from('profiles')
    .select('display_name, email, throwing_experience, attended_practice, avatar_url')
    .eq('id', user.id)
    .single()

  const role = roleData?.role || 'UNKNOWN'
  
  const hasSubmittedApplication = !!profileData?.throwing_experience || typeof profileData?.attended_practice === 'boolean'

  // Fetch upcoming events
  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('*')
    .order('start_date', { ascending: true })
    .gte('start_date', new Date(new Date().getTime() - 86400000).toISOString().split('T')[0])

  const gameIds = games?.map(g => g.id) || []
  
  // Fetch attendance records for these events
  let attendanceData = null
  if (gameIds.length > 0) {
    const { data, error: attendanceError } = await supabase
      .from('attendance')
      .select('*, profiles(display_name)')
      .in('game_id', gameIds)
    
    if (attendanceError) {
      console.error('Error fetching attendance:', attendanceError)
    }
    attendanceData = data
  }

  return (
    <main className="flex flex-1 flex-col p-4 md:p-8 bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/80 dark:from-slate-950 dark:via-blue-950/20 dark:to-indigo-950/30 min-h-[calc(100vh-4rem)]">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">{PAGE_TITLE}</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          
          {/* Main Content Column (Events) */}
          <div className="md:col-span-2 space-y-8 order-2 md:order-1">
            
            {role === 'PENDING' && !hasSubmittedApplication && (
              <ApplicationForm />
            )}

            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                <h2 className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 drop-shadow-sm">Upcoming Events</h2>
                {(role === 'ADMIN' || role === 'APPROVED') && (
                  <CreateEventModal />
                )}
              </div>
              
              {gamesError && (
                <p className="text-red-500">Error loading events. Please try again later.</p>
              )}

              {!gamesError && games?.length === 0 && (
                <p className="text-gray-500 italic">No upcoming events scheduled at this time.</p>
              )}

              {!gamesError && games && games.length > 0 && (
                <div className="grid gap-4">
                  {games.map((game) => {
                    const startDate = new Date(game.start_date + 'T00:00:00');
                    const isTwoDay = game.is_two_day;
                    const isSameDay = !isTwoDay;
                    const endDate = new Date(startDate);
                    if (isTwoDay) endDate.setDate(endDate.getDate() + 1);
                    
                    const gameAttendance = attendanceData?.filter(a => a.game_id === game.id) || [];
                    
                    return (
                      <div key={game.id} className={CARD_CLASSES}>
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                          <div className="w-full">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-xl font-bold">{game.name}</h3>
                              {game.type === 'PRACTICE' && (
                                <span className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-inset ring-white/20">
                                  {GAME_TYPES.PRACTICE}
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
                            
                            <AttendanceManager 
                              gameId={game.id} 
                              currentUserId={user.id} 
                              role={role} 
                              attendanceRecords={gameAttendance} 
                              isTwoDay={!isSameDay}
                            />
                          </div>
                          <div className="flex gap-2 items-start shrink-0 mt-4 md:mt-0">
                            {(role === 'ADMIN' || (role === 'APPROVED' && game.created_by === user.id)) && (
                              <EditEventModal game={game} />
                            )}
                            {role === 'ADMIN' && (
                              <DeleteEventButton eventId={game.id} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Column (Status & Profile) */}
          <div className="md:col-span-1 space-y-6 order-1 md:order-2 sticky top-6">
            <div className="rounded-3xl border border-slate-200/50 dark:border-slate-800/50 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl text-card-foreground shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl">
              <div className="h-24 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 relative">
                <div className="absolute inset-0 bg-white/10 dark:bg-black/10 mix-blend-overlay"></div>
              </div>
              <div className="p-6 pt-0 space-y-6">
                <div className="-mt-12 mb-2 relative">
                  <div className="h-24 w-24 rounded-full border-4 border-white dark:border-slate-950 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900 dark:to-purple-900 flex items-center justify-center text-4xl font-extrabold text-indigo-700 dark:text-indigo-300 shadow-lg ring-2 ring-indigo-500/20 overflow-hidden">
                    {profileData?.avatar_url ? (
                      <img src={profileData.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <>{(profileData?.display_name?.[0] || user.email?.[0] || '?').toUpperCase()}</>
                    )}
                  </div>
                </div>
                
                <div>
                  <h2 className="text-xl font-bold truncate">{profileData?.display_name || user.email || 'User'}</h2>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                </div>
                
                <div className="pt-4 border-t">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Account Status</h3>
                  <div className="flex flex-col space-y-3">
                    <div>
                      <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-extrabold shadow-md border ${ROLE_BADGE_CLASSES[role] || ROLE_BADGE_CLASSES.UNKNOWN}`}>
                        {role}
                      </span>
                    </div>
                    {role === 'PENDING' && !hasSubmittedApplication && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Please fill out the application form below to request approval.
                      </p>
                    )}
                    {role === 'PENDING' && hasSubmittedApplication && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Your application is under review by an administrator.
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Quick Links</h3>
                  {role === 'ADMIN' && (
                    <Link href="/dashboard/admin" className={buttonVariants({ variant: 'default', className: 'w-full justify-start' })}>
                      Admin Dashboard
                    </Link>
                  )}
                  <Link href={`/roster/${user.id}`} className={buttonVariants({ variant: 'outline', className: 'w-full justify-start' })}>
                    View Public Profile
                  </Link>
                  <Link href="/dashboard/profile" className={buttonVariants({ variant: 'outline', className: 'w-full justify-start' })}>
                    Edit Profile
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
