import { createClient } from '@/lib/supabase/server';
import { createEvents, EventAttributes } from 'ics';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const gameId = url.searchParams.get('game_id');

  if (!gameId) {
    return new NextResponse('Missing game_id parameter', { status: 400 });
  }

  const supabase = await createClient();

  const { data: game, error } = await supabase
    .from('games')
    .select('id, name, location, registration_url, start_date, is_two_day, start_time, end_time, type')
    .eq('id', gameId)
    .maybeSingle();

  if (error || !game) {
    return new NextResponse('Game not found', { status: 404 });
  }

  const start = new Date(game.start_date + 'T00:00:00');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventConfig: any = {
    uid: game.id,
    title: game.name,
    location: game.location || undefined,
    url: game.registration_url || undefined,
    description: game.registration_url ? `Registration: ${game.registration_url}` : undefined,
  };

  // Practice with start_time → use time-based event
  if (game.type === 'PRACTICE' && game.start_time) {
    const [hours, minutes] = game.start_time.split(':').map(Number);
    eventConfig.start = [
      start.getFullYear(),
      start.getMonth() + 1,
      start.getDate(),
      hours,
      minutes,
    ];

    if (game.end_time) {
      const [endHours, endMinutes] = game.end_time.split(':').map(Number);
      eventConfig.end = [
        start.getFullYear(),
        start.getMonth() + 1,
        start.getDate(),
        endHours,
        endMinutes,
      ];
    } else {
      eventConfig.duration = { hours: 1 };
    }
  } else {
    // All-day event
    eventConfig.start = [
      start.getFullYear(),
      start.getMonth() + 1,
      start.getDate(),
    ];
    eventConfig.duration = { days: game.is_two_day ? 2 : 1 };
  }

  const { error: icsError, value } = createEvents([eventConfig]);

  if (icsError || !value) {
    console.error('Error generating single-event iCal:', icsError);
    return new NextResponse('Internal Server Error', { status: 500 });
  }

  // Insert X-WR-CALNAME property after VERSION:2.0
  let valueWithMetadata = value;
  if (value.includes('VERSION:2.0')) {
    valueWithMetadata = value.replace(
      'VERSION:2.0',
      `VERSION:2.0\r\nX-WR-CALNAME:${game.name}\r\nNAME:${game.name}`
    );
  }

  const safeName = game.name.replace(/[^a-zA-Z0-9_-]/g, '_');

  return new NextResponse(valueWithMetadata, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}.ics"`,
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}