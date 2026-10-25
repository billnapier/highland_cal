<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Agent API contract

`docs/openapi.yaml` is the source of truth for the `/api/v1` Agent API (see `docs/API.md` and `docs/Detailed_Design.md` §4.6–4.7).
- Any change to API routes, `lib/core`, or the schemas they use must update `docs/openapi.yaml` in the same PR, and `docs/API.md` if behavior visible to users changes.
- All authorization lives in `lib/core`. API routes use the service-role client, which bypasses RLS, so never query Supabase from a route handler without going through core.
- Run `npx @redocly/cli lint docs/openapi.yaml` before committing.
