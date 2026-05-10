import { createClient } from '@/lib/supabase/server';
import { createEvents, EventAttributes } from 'ics';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: games, error } = await supabase
    .from('games')
    .select('id, name, location, registration_url, start_date, is_two_day')
    .gte('start_date', new Date(new Date().getTime() - 86400000).toISOString().split('T')[0])
    .order('start_date', { ascending: true });

  if (error) {
    console.error('Error fetching games for iCal feed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  const events: EventAttributes[] = (games || []).map((game) => {
    const start = new Date(game.start_date + 'T00:00:00');
    // For all-day events, `ics` uses start: [year, month, day]
    // And if duration is passed, it specifies how many days it spans.
    // If it's a 1-day event, we can specify a duration of 1 day.
    
    return {
      uid: game.id,
      title: game.name,
      location: game.location || undefined,
      url: game.registration_url || undefined,
      start: [
        start.getFullYear(),
        start.getMonth() + 1,
        start.getDate()
      ],
      duration: { days: game.is_two_day ? 2 : 1 },
      description: game.registration_url ? `Registration: ${game.registration_url}` : undefined,
    };
  });

  // Handle empty events case
  if (events.length === 0) {
    const emptyIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Highland Cal//EN',
      'CALSCALE:GREGORIAN',
      'END:VCALENDAR'
    ].join('\r\n');
    return new NextResponse(emptyIcs, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="highland-cal.ics"',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  }

  const { error: icsError, value } = createEvents(events);

  if (icsError || !value) {
    console.error('Error generating iCal feed:', icsError);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  return new NextResponse(value, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="highland-cal.ics"',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
