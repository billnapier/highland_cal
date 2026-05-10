import { createClient } from '@/lib/supabase/server';
import { createEvents, EventAttributes } from 'ics';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: games, error } = await supabase
    .from('games')
    .select('id, name, location, registration_url, start_timestamp, end_timestamp')
    .gte('end_timestamp', new Date().toISOString())
    .order('start_timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching games for iCal feed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  const events: EventAttributes[] = (games || []).map((game) => {
    const start = new Date(game.start_timestamp);
    const end = new Date(game.end_timestamp);

    return {
      uid: game.id,
      title: game.name,
      location: game.location || undefined,
      url: game.registration_url || undefined,
      start: [
        start.getUTCFullYear(),
        start.getUTCMonth() + 1,
        start.getUTCDate(),
        start.getUTCHours(),
        start.getUTCMinutes()
      ],
      end: [
        end.getUTCFullYear(),
        end.getUTCMonth() + 1,
        end.getUTCDate(),
        end.getUTCHours(),
        end.getUTCMinutes()
      ],
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
