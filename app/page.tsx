import { createClient } from '@/lib/supabase/server';
import LoginButton from '@/components/LoginButton';
import { Calendar, MapPin, ExternalLink } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

export default async function Home() {
  const supabase = await createClient();
  const { data: games, error } = await supabase
    .from('games')
    .select('*')
    .order('start_timestamp', { ascending: true })
    .gte('end_timestamp', new Date().toISOString());

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
                    {game.registration_url && (
                      <a href={game.registration_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                        <ExternalLink className="mr-2 h-4 w-4" /> Register
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
