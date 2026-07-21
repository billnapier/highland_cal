import { createClient } from '@/lib/supabase/server';
import { createEvents, EventAttributes } from 'ics';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validUserId = userId && uuidRegex.test(userId) ? userId : null;

  const supabase = await createClient();

  // Fetch club name and athlete name in parallel
  const [clubSettingResult, profileResult] = await Promise.all([
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'club_name')
      .single(),
    validUserId
      ? supabase
          .from('profiles')
          .select('display_name')
          .eq('id', validUserId)
          .single()
      : Promise.resolve({ data: null })
  ]);

  const clubName = clubSettingResult.data?.value || 'Highland Cal';
  const athleteName = profileResult.data?.display_name || '';
  const feedTitle = athleteName ? `${clubName}: ${athleteName}` : clubName;

  let query = supabase
    .from('games')
    .select(validUserId ? 'id, name, location, registration_url, start_date, is_two_day, attendance!inner(user_id, interest_level)' : 'id, name, location, registration_url, start_date, is_two_day')
    .gte('start_date', new Date(new Date().getTime() - 86400000).toISOString().split('T')[0])
    .order('start_date', { ascending: true });

  if (validUserId) {
    query = query
      .eq('attendance.user_id', validUserId)
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
      `X-WR-CALNAME:${feedTitle}`,
      `NAME:${feedTitle}`,
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

  // Insert X-WR-CALNAME and NAME properties after VERSION:2.0
  let valueWithMetadata = value;
  if (value.includes('VERSION:2.0')) {
    valueWithMetadata = value.replace(
      'VERSION:2.0',
      `VERSION:2.0\r\nX-WR-CALNAME:${feedTitle}\r\nNAME:${feedTitle}`
    );
  }

  return new NextResponse(valueWithMetadata, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="highland-cal.ics"',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
