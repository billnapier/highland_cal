## 2024-05-24 - Sequential Supabase Queries in Server Components
**Learning:** Server components in this codebase (like `app/page.tsx` and `app/dashboard/page.tsx`) often make multiple independent database queries using Supabase `await` sequentially. This creates an N+1 waterfall effect on the server, significantly delaying the time to first byte (TTFB) for users.
**Action:** Always check if multiple Supabase queries in Server Components or API routes can be executed concurrently using `Promise.all()` to minimize server processing time and TTFB.

## 2024-05-25 - Supabase Waterfall Queries
**Learning:** In Server Components fetching related data, the initial codebase sometimes performs sequential waterfall queries (e.g., fetching a list of games, then mapping over them to extract IDs, then performing a second `.in('game_id', gameIds)` query for attendance). This significantly delays Time to First Byte (TTFB).
**Action:** Always check if sequential Supabase queries for related data can be consolidated into a single joined query using Supabase's nested select syntax (e.g., `.select('*, attendance(*)')`) to eliminate the N+1 waterfall and fetch everything in a single round-trip.
