## 2024-05-24 - Sequential Supabase Queries in Server Components
**Learning:** Server components in this codebase (like `app/page.tsx` and `app/dashboard/page.tsx`) often make multiple independent database queries using Supabase `await` sequentially. This creates an N+1 waterfall effect on the server, significantly delaying the time to first byte (TTFB) for users.
**Action:** Always check if multiple Supabase queries in Server Components or API routes can be executed concurrently using `Promise.all()` to minimize server processing time and TTFB.
