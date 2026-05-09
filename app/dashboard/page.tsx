import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Calendar, MapPin } from 'lucide-react'
import DeleteEventButton from '@/components/DeleteEventButton'
import { CreateEventModal, EditEventModal } from '@/components/EventModals'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Fetch the user's role
  const { data: roleData } = await supabase
    .from('User_Roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  // Fetch the user's profile
  const { data: profileData } = await supabase
    .from('Profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .single()

  const role = roleData?.role || 'UNKNOWN'

  // Fetch upcoming events
  const { data: games, error: gamesError } = await supabase
    .from('Games')
    .select('*')
    .order('start_timestamp', { ascending: true })
    .gte('end_timestamp', new Date().toISOString())

  return (
    <main className="flex flex-1 flex-col p-8">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Welcome, {profileData?.display_name || user.email}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
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
                {role === 'PENDING' && (
                  <p className="text-sm text-muted-foreground">
                    Your account is pending approval by an administrator.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

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
                const startDate = new Date(game.start_timestamp);
                const endDate = new Date(game.end_timestamp);
                
                const isSameDay = startDate.toDateString() === endDate.toDateString();
                
                return (
                  <div key={game.id} className="p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                      <div>
                        <h3 className="text-xl font-bold mb-2">{game.name}</h3>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center">
                            <Calendar className="mr-2 h-4 w-4" />
                            <span>
                              {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                              {isSameDay 
                                ? ` • ${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` 
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
                      <div className="flex gap-2 items-start">
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
