# Highland Cal - Implementation Roadmap

This roadmap breaks down the development of Highland Cal into logical, sequential milestones. Each milestone is explicitly designed to be a standalone, verifiable chunk of work that leaves the application in a runnable, testable state. 

This document serves as the guide for the LLM developer. The LLM should implement these milestones **serially, in order**.

---

## Milestone 1: Project Scaffolding & CI Setup
**Goal:** Initialize the foundation of the Next.js application, configure styling, and set up continuous integration.
**References:** 
- `Detailed_Design.md` > 2. Tech Stack & Architecture
- `Detailed_Design.md` > 6.1 GitHub Actions
**Tasks:**
- [x] Initialize a Next.js project using the App Router.
- [x] Configure Tailwind CSS and set up `shadcn/ui` for accessible component scaffolding (avoid raw Tailwind CSS where `shadcn/ui` provides a component).
- [x] Set up standard ESLint and Prettier configurations.
- [x] Create a basic GitHub Action workflow (`.github/workflows/ci.yml`) for linting and type-checking on PRs.
- [x] Create a placeholder `/app/page.tsx` and a basic application layout with a navigation header.
**Runnable State:** 
- Running `npm run dev` displays a basic, styled "Coming Soon" or placeholder page. 
- The CI pipeline passes successfully on a test PR.

---

## Milestone 2: Database Initialization & Auth Scaffold
**Goal:** Define the exact database schema, Row Level Security (RLS) policies, and initialize the Supabase client within the application.
**References:** 
- `Detailed_Design.md` > 3. Database Schema & RLS Policies
**Tasks:**
- [x] Create a `supabase/migrations/20260520000000_initial_schema.sql` file containing all table definitions (`Profiles`, `User_Roles`, `Games`, `Attendance`), custom ENUMs, the `is_admin()` security definer function, Row Level Security policies, and the `AFTER INSERT` trigger (with its associated function) on `auth.users`.
- [x] Set up the Supabase client utilities in the Next.js app (e.g., `/lib/supabase/server.ts`, `/lib/supabase/client.ts`).
- [x] Configure local environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Note: Ensure the Service Role Key is never prefixed with `NEXT_PUBLIC_`.
- [x] Create a simple database health check component or route to confirm the application can successfully query Supabase.
**Runnable State:** 
- The application successfully connects to a provisioned Supabase instance. 
- The migration file can be successfully applied to the database via Supabase GitHub integration or CLI.

---

## Milestone 3: Authentication & Admin Bootstrapping
**Goal:** Implement Google OAuth login, the onboarding data flow, and the initial Admin bootstrapping mechanism.
**References:** 
- `User_Journeys.md` > Journey 2: Frictionless Onboarding & Pending Approval
- `User_Journeys.md` > Journey 6: Instance Deployment & Setup
- `Detailed_Design.md` > 4.1 Onboarding & Authentication Flow
**Tasks:**
- [x] Add a "Login with Google" button to the UI, wiring it to Supabase Auth.
- [x] Implement the auth callback route (e.g., `/app/auth/callback/route.ts`) to handle the OAuth redirect and session exchange.
- [x] Implement the **Admin Bootstrapping** logic in the callback: Check if the logging-in user's email matches `process.env.INITIAL_ADMIN_EMAIL` and they do not already have the `ADMIN` role. If so, use the Service Role Key to elevate their role in `User_Roles` to `ADMIN`.
- [x] Create a basic authenticated `/app/dashboard/page.tsx` that displays the user's current role (`PENDING`, `APPROVED`, `ADMIN`).
**Runnable State:** 
- A user can click Login, authenticate with Google, and be redirected to a dashboard. 
- The database correctly populates `Profiles` and `User_Roles` via the SQL trigger. 
- The initial admin email gets automatically promoted to `ADMIN`.

---

## Milestone 4: Public Calendar & iCal Feed (Journey 1)
**Goal:** Build the primary public-facing features: the schedule of events and the calendar subscription feed.
**References:** 
- `User_Journeys.md` > Journey 1: Discovering Upcoming Games and Practices
- `Detailed_Design.md` > 3.2 Games Table
- `Detailed_Design.md` > 4.4 iCal Feed Generation
**Tasks:**
- [x] Update `/app/page.tsx` to fetch and display the list of upcoming Games from the `Games` table. This must be accessible without authentication (relying on the public RLS policy).
- [x] Implement `/app/api/calendar.ics/route.ts` to serialize the `Games` table into a valid iCal feed using the `ics` npm package (include Cache-Control headers to optimize performance).
- [x] Add a "Subscribe to Calendar" button on the public page that links to the `.ics` route.
**Runnable State:** 
- Unauthenticated visitors can see a chronologically sorted list of games (using mock data inserted manually into Supabase). 
- Users can successfully download/subscribe to the `.ics` feed.

---

## Milestone 5: Event Management (Delete & Basic UI)
**Goal:** Provide the basic UI to view the schedule from the dashboard and allow Admins to delete events.
**References:** 
- `User_Journeys.md` > Journey 8: Event Cleanup
**Tasks:**
- [x] Create the event list view on the authenticated dashboard.
- [x] Implement a Next.js Server Action for deleting records from the `Games` table (ensure strict server-side authorization checks for each action).
- [x] Ensure the frontend respects user roles (the Delete button should only render for `ADMIN` users).
- [x] *Note:* Stub out the Resend email notifications with `console.log()` for now to isolate concerns.
**Runnable State:** 
- An `ADMIN` can delete a game. 
- The public page reflects these changes immediately.

---

## Milestone 6: Event Management (Create & Edit Forms)
**Goal:** Provide the complex forms and Server Actions for `APPROVED` users to add and modify the calendar.
**References:** 
- `User_Journeys.md` > Journey 3: The High-Trust Event Management
- `Detailed_Design.md` > 4.2 Event Management Flow
**Tasks:**
- [x] Create a "Create Event" form/modal on the authenticated dashboard using `react-hook-form` and `zod` for validation.
- [x] Create an "Edit Event" form/modal (ensure the "major change" checkbox is included in the UI state).
- [x] Implement Next.js Server Actions for inserting and updating records in the `Games` table (ensure strict server-side authorization checks for each action).
- [x] *Note:* Continue to stub out Resend email notifications.
**Runnable State:** 
- An `APPROVED` user can add or edit a game through validated forms.
- The public page reflects these changes immediately.

---

## Milestone 7: RSVP & Attendance Tracking (Journey 4)
**Goal:** Enable athletes to register their interest level for events and coordinate with others.
**References:** 
- `User_Journeys.md` > Journey 4: Registering & RSVPing for a Competition
- `Detailed_Design.md` > 3.3 Attendance Table
**Tasks:**
- [x] Build the Attendance UI component, embedded within the event view on the authenticated dashboard.
- [x] Allow `APPROVED` users to select/update their `interest_level` (`WATCHING`, `INTERESTED`, `REGISTERED`, `NOT_GOING`).
- [x] Display an aggregated summary of who is attending the event.
- [x] Ensure RLS policies restrict attendance modification strictly to `auth.uid()`.
**Runnable State:** 
- Authenticated users can set and change their RSVP status. 
- The UI dynamically updates to reflect their selection and lists other attendees.

---

## Milestone 8: Personal Profile Management (Journey 5)
**Goal:** Allow users to maintain their public persona and competition details.
**References:** 
- `User_Journeys.md` > Journey 5: Managing Personal Profile
**Tasks:**
- [x] Create a dedicated `/app/dashboard/profile/page.tsx` (using `/app/dashboard/profile/page.tsx` since `/app/dashboard/profile` is a directory for the page).
- [x] Build a form using `react-hook-form` and `zod` to update the user's `class` and `outward_links` (JSONB). The form should explicitly include inputs for Instagram and Facebook, and allow up to 5 additional custom links.
- [x] Implement a Server Action to securely update the `Profiles` table for the authenticated user.
- [x] Create a public roster view or profile card component so the club can show off its athletes.
**Runnable State:** 
- Users can successfully update their competition class and add social media links. 
- These changes persist to the database and are viewable in the public roster.

---

## Milestone 9: Admin User Management (Journeys 7 & 9)
**Goal:** Provide Admins the tools to approve pending users, promote new admins, and manage the roster.
**References:** 
- `User_Journeys.md` > Journey 7: Managing User Access
- `User_Journeys.md` > Journey 9: Promoting a User to Admin
- `Detailed_Design.md` > 4.3 User Deletion
**Tasks:**
- [x] Create an `/app/dashboard/admin/page.tsx` view, strictly gated to `ADMIN` users.
- [x] Fetch and display a list of all users and their current roles from `Profiles` joined with `User_Roles`.
- [x] Implement secure Server Actions to:
  - [x] Approve a `PENDING` user (updates to `APPROVED`).
  - [x] Promote an `APPROVED` user to `ADMIN`.
  - [x] Delete a user (must use the Supabase Admin API via the Service Role Key to remove the identity from `auth.users`; ensure `ON DELETE CASCADE` is configured on related tables).
**Runnable State:** 
- The Admin can view the user list, approve new registrations (granting them immediate write access), and permanently delete users.

---

## Milestone 10: Email Notifications Integration
**Goal:** Replace the stubbed notification logs with live transactional emails via Resend.
**References:** 
- `Detailed_Design.md` > 4.3 Notifications (Next.js Server Actions)
**Tasks:**
- [x] Integrate the Resend Node.js SDK and `react-email` for building HTML email templates.
- [x] Wire up the **New User Registration** email (triggered during onboarding, sent to Admins).
- [x] Wire up the **User Approved** email (triggered by Admin action, sent to Athlete).
- [x] Wire up the **New Event / Major Edit** email (triggered by event creation/edit, sent to Approved Athletes).
- [x] Wire up the **Event Deletion** email (triggered by Admin action, sent to Approved Athletes).
**Runnable State:** 
- Actions taken in the application successfully and reliably dispatch real, styled emails to the correct recipients.


---

## Milestone 11: Custom Domain & Production Launch
**Goal:** Configure a custom domain in Vercel and verify the domain in Resend for professional email delivery.
**References:** 
- `Deployment.md` > 7. Custom Domain Setup & Verification
**Tasks:**
- [x] Add the custom domain to the Vercel project settings and configure the necessary DNS records (A/CNAME) at the domain registrar.
- [x] Add the custom domain to the Resend project settings and configure the necessary DNS records (TXT/MX) to verify the domain for sending emails.
- [x] Update the `NEXT_PUBLIC_APP_URL` environment variable in Vercel to reflect the new custom domain.
- [x] Update the application codebase (where applicable) to ensure the Resend `from` address matches the verified domain.
**Runnable State:** 
- The application is fully accessible via the custom domain.
- Transactional emails are successfully delivered from a custom email address without being marked as spam.

---

## Milestone 12: Image Uploads & Visual Enhancements
**Goal:** Allow users to personalize their profiles and allow admins to customize the public homepage with imagery.
**Tasks:**
- [x] Create a `public_images` bucket in Supabase and add the `avatar_url` column to the `Profiles` table in the initial migration.
- [x] Build an `ImageUpload` React component using `@supabase/supabase-js` storage API.
- [x] Update the athlete `ProfileForm` to include a profile photo upload.
- [x] Update the `AdminSettings` page to allow admins to upload a custom `hero_image_url`.
- [x] Render the hero image on the public `/app/page.tsx` behind the club name and blurb.
- [x] Render the athlete's `avatar_url` on their `/app/roster/[id]/page.tsx` profile page and the roster list.
**Runnable State:** 
- Admins can customize the main landing page with a hero image.
- Athletes can upload their own profile photos, which are visible to the public.

---

## Milestone 13: One-Click Deployment for Other Clubs
**Goal:** Document the deployment process so other clubs can launch their own instance of Highland Cal.
**References:**
- `Deployment.md`
- `User_Journeys.md` > Journey 6: Instance Deployment & Setup
**Tasks:**
- [x] Migrate `Human_Configuration.md` to `Deployment.md` and rebrand as a deployment guide for other clubs.
- [x] Update `README.md` to link to the new `Deployment.md` guide.
- [x] Ensure the use case of other clubs deploying the app is captured in `User_Journeys.md` (Journey 6).
- [x] Verify if any design docs need updates related to this deployment feature.
**Runnable State:**
- The documentation is complete and accessible for any club looking to reuse the codebase.

---

## Milestone 14: Agent API (REST + Personal Access Tokens)
**Goal:** Expose event management, RSVPs, and admin user management over a versioned JSON REST API so AI agents, scripts, and cron jobs can operate the club calendar on a member's behalf.
**References:**
- `API.md` (usage guide) and `openapi.yaml` (contract — the source of truth for every route, field, and error)
- `Detailed_Design.md` > 3.5 Agent API Tables, 3.6 Token-Aware Row Level Security, 3.7 Notification Outbox, 4.3 User Deletion, 4.6 Agent API, 4.7 Personal Access Tokens
- `User_Journeys.md` > Journey 11: Connecting an AI Agent, Journey 12: Agent-Assisted Club Administration
**Tasks:**
- [ ] **Migration** `supabase/migrations/<timestamp>_api_tokens.sql` (see `Detailed_Design.md` §3.5–3.6):
  - Create `Api_Tokens` (RLS + column grants), `Api_Rate_Limits`, and `Api_Idempotency_Keys`.
  - Create `request_token()`, `current_actor_id()`, `is_session()`, `has_scope()`, `api_authenticate()`, `api_rate_limit_anonymous()`, `revoke_api_token()` (irreversible; no `UPDATE` grant/policy on `Api_Tokens`), `api_create_event()` (atomic idempotent create, `SECURITY INVOKER`), `get_user_private()`, and `authorize_user_deletion()`.
  - Redefine `is_admin()` / `is_approved_or_admin()` on `current_actor_id()`.
  - Drop and recreate the write policies on `Games`, `Attendance`, `User_Roles`, `Settings`, and storage to the token-aware form, using the `(select fn())` pattern.
  - Close the pre-existing private-field exposure (`Detailed_Design.md` §4.6, "Private profile fields"): `REVOKE SELECT ON Profiles FROM anon, authenticated`, then `GRANT SELECT (<public column allowlist>)`. Revoking only the `email` column would leave the table-level grant in place. Expose `email`/application answers via `get_user_private()`, gated on self **or** `is_admin() AND has_scope('users:admin')`. Switch the dashboard and admin pages to it.
  - Create `Notification_Outbox` and its `SECURITY DEFINER` triggers on `Games`, `User_Roles`, and `handle_new_user()` (`Detailed_Design.md` §3.7).
- [ ] **Notification dispatcher** `lib/notifications/dispatch.ts`: server-only, service-role, no caller input. It drains the outbox with `FOR UPDATE SKIP LOCKED`, resolves recipients, and sends via Resend, using the outbox `id` as the Resend idempotency key. Kick it with `after()` from every mutation, and add a daily Vercel Cron fallback (`/api/cron/notifications`, `CRON_SECRET`). Remove recipient lookup from `lib/email.ts` and the 60-second "new user" heuristic from the auth callback. Emails must be unchanged from the user's point of view.
- [ ] **RLS tests (pgTAP)** in `supabase/tests/`: the full authorization matrix (anonymous / session / PAT × role × scopes × ownership × operation), expired/revoked tokens, revocation cannot be undone, session-takes-precedence, `token_hash` and private profile columns not selectable by `anon`/`authenticated`, `get_user_private()` requires `users:admin` for other users, idempotent create (replay, `409` on hash mismatch, no duplicate outbox rows), the **policy invariant** check over `pg_policies`, and the **`SECURITY DEFINER` allowlist** check. Run in CI with `supabase start` + `supabase test db`. **This suite is the authorization test suite; there is no separate app-level permission matrix.**
- [ ] **Refactor to shared request logic.** Move the duplicated logic of `app/actions/events.ts`, `attendance.ts`, and `admin.ts` into `lib/core/` functions that take a Supabase client (session or token-bound), validate with Zod, run the query, map RLS outcomes (`42501`, 0 rows affected) to typed errors, set the notification headers, and kick the dispatcher. Existing hand-written role checks in Server Actions are kept only as advisory pre-checks for error messages; RLS is the authority. `deleteUser` switches to calling `authorize_user_deletion()` before using the service-role client. UI behavior must not change.
- [ ] **Token management UI** on `/dashboard/profile`: an "API Tokens" section to create (name, scopes, expiry), list (name, prefix, scopes, created, last used, expires), and revoke tokens. The plaintext token is shown exactly once in a copy-to-clipboard dialog. Admin-only scopes are offered only to Admins.
- [ ] **Auth helper** `lib/api/auth.ts`: read `Authorization: Bearer`, build an **anon-key** client with the `x-hcal-token` header (never the service role), and call `rpc('api_authenticate')` → `401`/`429` or `{ client, identity }`. Designed so a second credential type (Supabase OAuth JWT, Milestone 15) can be added without touching routes.
- [ ] **API routes** under `app/api/v1/` implementing every operation in `openapi.yaml`: `/me`, `/me/attendance`, `/events`, `/events/{id}`, `/events/{id}/attendance`, `/events/{id}/attendance/me`, `/users`, `/users/{id}`, `/users/{id}/approve`, `/users/{id}/promote`, `/tokens`, `/tokens/{id}`. All queries go through the token-bound client from the auth helper, so RLS enforces permissions. Use real HTTP status codes and the standard error envelope. Mutations produce the same notifications (via the outbox) and `revalidatePath` calls as the UI. `POST /events` with `Idempotency-Key` goes through `api_create_event()`.
- [ ] **Docs routes:** serve the spec at `/api/v1/openapi.yaml` and a rendered interactive reference at `/api/v1/docs` (static HTML page loading Scalar or Redoc from a CDN — no new runtime dependency).
- [ ] **Tests** (add Vitest and wire it into CI): API route behavior (status-code mapping incl. 0-rows → 403/404, error envelope, idempotency, rate-limit headers) and contract tests asserting each route's responses validate against `openapi.yaml`. Permissions are covered by the pgTAP suite, not re-tested here.
- [x] **CI: API spec lint** (`.github/workflows/api-spec.yml`) runs `@redocly/cli lint` (config in `redocly.yaml`) on every push and PR that touches the spec.
- [ ] **CI:** add the pgTAP suite (`supabase start` + `supabase test db`), and the Vitest suite to `.github/workflows/ci.yml`. Extend `api-spec.yml` to also fail on spec ↔ route drift once routes exist.
- [ ] Verify `API.md` examples work end-to-end against a preview deployment; update docs for anything that changed during implementation.
**Runnable State:**
- A member can create a token in their profile, and `curl -H "Authorization: Bearer hcal_pat_…" https://<site>/api/v1/me` returns their identity and capabilities.
- An Approved member's token can create/edit their events and RSVP; an Admin's token can delete events and approve/promote/delete users; a Pending member's token is read-only; revoked or expired tokens return `401`.
- `/api/v1/docs` renders the API reference, and the web UI behaves exactly as before (the pgTAP suite proves session permissions are unchanged).
- No API route uses the service-role key except the database-authorized `auth.admin.deleteUser()` call.
- No new manual setup steps for clubs: "Sync fork" applies the migration automatically.

---

## Milestone 15: OAuth & Hosted MCP Endpoint (Future)
**Goal:** Let non-technical members connect MCP-native apps (Claude.ai, Claude Desktop, ChatGPT connectors) with a "Sign in with Google" consent flow instead of copying a token.
**Prerequisites:** Milestone 14 complete; re-evaluate the status of Supabase Auth's OAuth 2.1 server (public beta as of this writing) and its scope support before starting.
**References:**
- `Detailed_Design.md` > 4.8 Future: OAuth 2.1 & MCP
- Supabase docs: OAuth 2.1 Server and MCP Authentication
**Tasks:**
- [ ] Document the opt-in Supabase dashboard steps in `Deployment.md` (enable OAuth 2.1 server, asymmetric JWT signing keys, dynamic client registration). This must remain **optional** — instances that skip it keep working with PATs only.
- [ ] Build the OAuth consent page (`/oauth/consent`) reusing the existing Google login.
- [ ] Extend `has_scope()` (and `request_token()` precedence rules) to handle Supabase-issued OAuth access tokens. They are real Supabase JWTs, so `auth.uid()` works natively. Extend `lib/api/auth.ts` to pass them through as the standard `Authorization` header. Add pgTAP cases for OAuth callers.
- [ ] Add a hosted MCP endpoint at `/api/mcp` (e.g. using Vercel's `mcp-handler`) exposing the same `lib/core` operations as MCP tools, accepting either a PAT or an OAuth token, and publishing OAuth protected-resource metadata.
- [ ] Add "Connected apps" to the profile page to list and revoke OAuth grants.
**Runnable State:**
- A member can add `https://<site>/api/mcp` as a custom connector in Claude.ai, sign in with Google, approve consent, and ask Claude to RSVP for them.
