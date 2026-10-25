<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent API contract & authorization

`docs/openapi.yaml` is the source of truth for the `/api/v1` Agent API (see `docs/API.md` and `docs/Detailed_Design.md` §3.6, §4.6–4.7).
- Any change to API routes, `lib/core`, or the schemas they use must update `docs/openapi.yaml` in the same PR, and `docs/API.md` if behavior visible to users changes.
- **Row Level Security is the only authorization of record**, for both the UI and the API. Never implement a permission rule only in TypeScript. If a rule changes, change the RLS policy in a new migration and its pgTAP test; app-side role checks are advisory, for error messages only.
- API routes use the token-bound **anon-key** client from `lib/api/auth.ts`. Never use the service-role client in API routes, except for `auth.admin.deleteUser()` after `authorize_user_deletion()` succeeds.
- Every write policy that uses `is_admin()`, `is_approved_or_admin()`, or `current_actor_id()` must also include `has_scope(…)` or `is_session()`. The pgTAP invariant test enforces this.
- Run `npx @redocly/cli lint docs/openapi.yaml` and `supabase test db` before committing.
