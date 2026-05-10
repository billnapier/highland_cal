import { createClient } from '@/lib/supabase/server';
import LoginButton from '@/components/LoginButton';
import { Calendar, MapPin, ExternalLink } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

interface AttendanceRecord {
  interest_level: string;
  attend_day: string | null;
  profiles: { display_name: string | null } | null;
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

  return (
    <main className="flex flex-1 flex-col items-center p-8 max-w-4xl mx-auto w-full">
      <div className="flex flex-col items-center space-y-8 text-center w-full mb-12">
        <div className="space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
            Highland Cal
          </h1>
          <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400">
            The schedule of Highland Games and practices.
          </p>
        </div>
        <div className="flex space-x-4 items-center flex-wrap justify-center gap-y-4">
          <LoginButton />
          <Link href="/api/calendar.ics" prefetch={false} className={buttonVariants({ variant: 'outline' })}>
            <Calendar className="mr-2 h-4 w-4" /> Subscribe to Calendar
          </Link>
        </div>
      </div>

      <div className="w-full space-y-4">
        <h2 className="text-2xl font-bold border-b pb-2">Upcoming Events</h2>
        
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
              const endDate = isTwoDay ? new Date(startDate.getTime() + 86400000) : startDate;
              
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
      </div>
    </main>
  );
}
