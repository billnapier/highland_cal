import { createClient } from '@/lib/supabase/server';
import { createEvents, EventAttributes } from 'ics';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: games, error } = await supabase
    .from('Games')
    .select('*')
    .order('start_timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching games for iCal feed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  const events: EventAttributes[] = (games || []).map((game) => {
    return {
      title: game.name,
      location: game.location || undefined,
      url: game.registration_url || undefined,
      start: new Date(game.start_timestamp).getTime(),
      startInputType: 'utc',
      end: new Date(game.end_timestamp).getTime(),
      endInputType: 'utc',
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
