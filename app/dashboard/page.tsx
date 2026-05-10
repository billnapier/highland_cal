import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Calendar, MapPin } from 'lucide-react'
import DeleteEventButton from '@/components/DeleteEventButton'
import { CreateEventModal, EditEventModal } from '@/components/EventModals'
import AttendanceManager from '@/components/AttendanceManager'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import ApplicationForm from '@/components/ApplicationForm'

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
    .select('display_name, email, throwing_experience, attended_practice')
    .eq('id', user.id)
    .single()

  const role = roleData?.role || 'UNKNOWN'
  
  const hasSubmittedApplication = !!profileData?.throwing_experience || profileData?.attended_practice !== null

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
    <main className="flex flex-1 flex-col p-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Welcome, {profileData?.display_name || user.email}</h2>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <div className="flex gap-2">
                  {role === 'ADMIN' && (
                    <Link href="/dashboard/admin" className={buttonVariants({ variant: 'default', size: 'sm' })}>
                      Admin Dashboard
                    </Link>
                  )}
                  <Link href={`/roster/${user.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    View Public Profile
                  </Link>
                  <Link href="/dashboard/profile" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Edit Profile
                  </Link>
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium text-muted-foreground">Account Status</h3>
              <div className="mt-2 flex items-center space-x-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                  ${role === 'ADMIN' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' : ''}
                  ${role === 'APPROVED' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : ''}
                  ${role === 'PENDING' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' : ''}
                  ${role === 'UNKNOWN' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' : ''}
                `}>
                  {role}
                </span>
                {role === 'PENDING' && !hasSubmittedApplication && (
                  <p className="text-sm text-muted-foreground">
                    Please fill out the application form below to request approval.
                  </p>
                )}
                {role === 'PENDING' && hasSubmittedApplication && (
                  <p className="text-sm text-muted-foreground">
                    Your application is under review by an administrator.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {role === 'PENDING' && !hasSubmittedApplication && (
          <ApplicationForm />
        )}

        <div className="space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-2xl font-bold">Upcoming Events</h2>
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
                  <div key={game.id} className="p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                      <div className="w-full">
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
    </main>
  )
}
