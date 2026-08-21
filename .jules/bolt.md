## 2024-05-24 - Sequential Supabase Queries in Server Components
**Learning:** Server components in this codebase (like `app/page.tsx` and `app/dashboard/page.tsx`) often make multiple independent database queries using Supabase `await` sequentially. This creates an N+1 waterfall effect on the server, significantly delaying the time to first byte (TTFB) for users.
**Action:** Always check if multiple Supabase queries in Server Components or API routes can be executed concurrently using `Promise.all()` to minimize server processing time and TTFB.

## 2024-05-25 - Supabase Waterfall Queries
**Learning:** In Server Components fetching related data, the initial codebase sometimes performs sequential waterfall queries (e.g., fetching a list of games, then mapping over them to extract IDs, then performing a second `.in('game_id', gameIds)` query for attendance). This significantly delays Time to First Byte (TTFB).
**Action:** Always check if sequential Supabase queries for related data can be consolidated into a single joined query using Supabase's nested select syntax (e.g., `.select('*, attendance(*)')`) to eliminate the N+1 waterfall and fetch everything in a single round-trip.

## 2025-02-14 - Consolidating Dynamic Route Identifier Lookups
**Learning:** In dynamic routes like `app/roster/[id]/page.tsx`, where an identifier could be either a custom vanity string or a default UUID, performing sequential lookups (try vanity -> if fail, try UUID) causes a 2-step waterfall. If we also fetch nested relation data (like attendance) as a separate third query, it becomes a 3-step waterfall.
**Action:** When an identifier can be one of multiple types (like a vanity name or UUID), consolidate the lookups into a single network request using `.or(vanity_name.eq.${id},id.eq.${id})` (after validating if it is a UUID) along with nested select syntax (e.g. `attendance(...)`) to avoid sequential query waterfalls and significantly improve TTFB.

## 2025-02-14 - Sequential Supabase Queries in Server Actions
**Learning:** Next.js Server Actions in this codebase (like `app/actions/events.ts`) often perform validation lookups (e.g., fetching a user profile, checking roles, getting an entity's name before mutation) as sequential Supabase queries. This creates an N+1 waterfall effect that delays the mutation execution time and causes a slower user experience during interactions.
**Action:** Always check if independent sequential Supabase queries in Server Actions can be combined into concurrent lookups using `Promise.all()` to improve mutation latency. Note that attempting joins across unrelated or implicitly related tables (like `profiles` and `user_roles`) may cause runtime crashes if the schema doesn't support them, so independent queries inside `Promise.all` are often safer unless the foreign key is explicitly confirmed.
