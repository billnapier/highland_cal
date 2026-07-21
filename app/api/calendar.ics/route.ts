import { createClient } from '@/lib/supabase/server';
import { createEvents, EventAttributes } from 'ics';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idParam = url.searchParams.get('id') || url.searchParams.get('user_id');

  const supabase = await createClient();
  let resolvedUserId: string | null = null;

  if (idParam) {
    // 1. Try to find the profile by vanity_name first
    const { data: profileByVanity } = await supabase
      .from('profiles')
      .select('id')
      .eq('vanity_name', idParam)
      .maybeSingle();

    if (profileByVanity) {
      resolvedUserId = profileByVanity.id;
    } else {
      // 2. If no match, check if it's a valid UUID, then query by ID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
      if (isUuid) {
        const { data: profileByUuid } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', idParam)
          .maybeSingle();
        
        if (profileByUuid) {
          resolvedUserId = profileByUuid.id;
        }
      }
    }

    // If an ID was requested but could not be resolved to a user,
    // return an empty calendar feed rather than falling back to all games.
    if (!resolvedUserId) {
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
  }

  let query = supabase
    .from('games')
    .select(resolvedUserId ? 'id, name, location, registration_url, start_date, is_two_day, attendance!inner(user_id, interest_level)' : 'id, name, location, registration_url, start_date, is_two_day')
    .gte('start_date', new Date(new Date().getTime() - 86400000).toISOString().split('T')[0])
    .order('start_date', { ascending: true });

  if (resolvedUserId) {
    query = query
      .eq('attendance.user_id', resolvedUserId)
      .in('attendance.interest_level', ['REGISTERED', 'INTERESTED']);
  }

  const { data: games, error } = await query;

  if (error) {
    console.error('Error fetching games for iCal feed:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: EventAttributes[] = ((games as any) || []).map((game: any) => {
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
