# Highland Cal - Detailed Technical Design Document

## 1. Overview
Highland Cal is a decentralized, self-hosted web application built for Highland Games throwing clubs to coordinate attendance, track events, and manage athlete profiles. This document specifies the technical implementation details required to build the project, acting as a blueprint for an LLM or human developer.

## 2. Tech Stack & Architecture
- **Frontend / API:** Next.js (App Router, React, Tailwind CSS, `shadcn/ui` for components, `react-hook-form` and `zod` for forms)
- **iCal Generation:** `ics` npm package
- **Database / Auth:** Supabase (PostgreSQL, Row Level Security, Auth)
- **Authentication Provider:** Google OAuth 2.0 (Federated, Zero Password)
- **Email Service:** Resend with `react-email` templates
- **Agent API:** Versioned REST API (`/api/v1`) described by an OpenAPI 3.1 spec (`docs/openapi.yaml`), authenticated with Personal Access Tokens
- **Hosting:** Vercel

## 3. Database Schema & RLS Policies (PostgreSQL)

### 3.1 `Profiles` and `User_Roles` Tables
User data is split into two tables to enable standard Row Level Security without complex column-level triggers.

**`Profiles` Table** (Stores extended user information)
- `id` (uuid, Primary Key): References `auth.users(id)` on delete cascade.
- `display_name` (text): Athlete's name.
- `email` (text): Athlete's email address (synced from auth. Note: this is a point-in-time snapshot unless an `AFTER UPDATE` trigger on `auth.users` is also implemented).
- `class` (text): Competition class (e.g., A-Class, Masters, Women).
- `outward_links` (jsonb): Social media and external profile links. The JSON structure should explicitly support `"instagram"` and `"facebook"` keys, and a `"custom_links"` array containing up to 5 objects with `"label"` and `"url"`.
- `vanity_name` (text, unique, nullable): Unique, custom slug for the athlete profile URL.
- `created_at` (timestamptz): Default `now()`.

*Crucial Implementation Detail:* A Postgres `AFTER INSERT` trigger on the `auth.users` table must be created to automatically insert a new row into `Profiles` whenever a user signs up. This prevents the "race condition" of relying on the Next.js frontend redirect to create the user profile.

To prevent the LLM from guessing the syntax, here is the explicit SQL for the trigger:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.Profiles (id, email, display_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  
  INSERT INTO public.User_Roles (user_id, role)
  VALUES (new.id, 'PENDING');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

**RLS Policies (`Profiles`):**
- **Read:** Publicly readable (to serve as a club roster).
- **Update:** Users can update their own row (`id = auth.uid()`). 

**`User_Roles` Table** (Stores authorization state)
- `user_id` (uuid, Primary Key): References `Profiles(id)` on delete cascade.
- `role` (text): Account status. Must be enforced via a PostgreSQL custom `ENUM` type or a `CHECK` constraint: `['PENDING', 'APPROVED', 'ADMIN']`. Default: `'PENDING'`.

**RLS Policies (`User_Roles`):**
- **Read:** Publicly readable.
- **Insert:** Handled by the same `AFTER INSERT` trigger on `auth.users` that creates the Profile.
- **Update:** Allowed only if the requesting user has the `ADMIN` role.
  - *Recursion Warning:* To check the role, use a `SECURITY DEFINER` function (e.g., `is_admin()`) inside this RLS policy to avoid infinite recursion when querying the `User_Roles` table.

### 3.2 `Games` Table
Stores upcoming games and practices.
- `id` (uuid, Primary Key): Default `gen_random_uuid()`.
- **name** (text): Name of the game or practice.
- **start_date** (date): Start date of the event/practice.
- **is_two_day** (boolean): Whether the event is a two-day event. Applicable only when `type` is 'EVENT'.
- **type** (text): Must be a PostgreSQL `ENUM` type or `CHECK` constraint: `['EVENT', 'PRACTICE']`. Default: `'EVENT'`.
- **start_time** (time): The starting time (e.g., '14:00:00'). Required only for 'PRACTICE' type.
- **end_time** (time): The ending time (e.g., '16:00:00'). Required only for 'PRACTICE' type.
- `location` (text): Location (City, State).
- `registration_url` (text): External registration link.
- `created_by` (uuid): References `Profiles(id)` on delete set null.
- `created_at` (timestamptz): Default `now()`.

**RLS Policies (`Games`):**
- **Read:** Publicly readable (acts as a marketing tool).
- **Insert/Update:** Allowed if the requesting user's `role` in `User_Roles` is `'APPROVED'` or `'ADMIN'`. 
- **Delete:** Allowed only if the requesting user's `role` is `'ADMIN'`.

### 3.3 `Attendance` Table
Tracks RSVPs.
- `id` (uuid, Primary Key): Default `gen_random_uuid()`.
- `user_id` (uuid): References `Profiles(id)` on delete cascade.
- `game_id` (uuid): References `Games(id)` on delete cascade.
- `interest_level` (text): Must be enforced via a PostgreSQL custom `ENUM` type or a `CHECK` constraint: `['WATCHING', 'INTERESTED', 'REGISTERED', 'NOT_GOING']`.
- `updated_at` (timestamptz): Default `now()`.
- **Constraint:** Unique constraint on `(user_id, game_id)`.

**RLS Policies (`Attendance`):**
- **Read:** Publicly readable.
- **Insert/Update/Delete:** Allowed only if `user_id = auth.uid()` AND the user's `role` in `User_Roles` is `'APPROVED'` or `'ADMIN'`. If a user's role is revoked to `'PENDING'`, their past attendance records are frozen (read-only).

### 3.4 `Settings` Table
Key/value store for site customization (`club_name`, home page blurb, `hero_image_url`).
- **Read:** Publicly readable. **Write:** `ADMIN` only.

### 3.5 Agent API Tables (Milestone 14)
Added in a new timestamped migration (`supabase/migrations/<timestamp>_api_tokens.sql`). Never edit the initial migration.

**`Api_Tokens` Table** (Personal Access Tokens)
- `id` (uuid, Primary Key): Default `gen_random_uuid()`.
- `user_id` (uuid, NOT NULL): References `Profiles(id)` **on delete cascade** — deleting a user deletes their tokens.
- `name` (text, NOT NULL): Human label (e.g. "Hermes agent"), 1–100 chars.
- `token_hash` (text, NOT NULL, UNIQUE): Hex SHA-256 of the full plaintext token. The plaintext is never stored.
- `prefix` (text, NOT NULL): First 12 characters of the token (e.g. `hcal_pat_Ab3`) for display/identification.
- `scopes` (text[], NOT NULL, default `'{}'`): Subset of `['attendance:write', 'events:write', 'events:delete', 'users:admin']`, enforced by a `CHECK` constraint (`scopes <@ ARRAY[...]`).
- `created_at` (timestamptz): Default `now()`.
- `expires_at` (timestamptz, nullable): `NULL` = never expires.
- `last_used_at` (timestamptz, nullable).
- `revoked_at` (timestamptz, nullable): Revocation is a soft delete so `last_used_at` history is kept for auditing.

**RLS Policies (`Api_Tokens`):**
- **Read:** Only the owner (`user_id = auth.uid()`). Tokens are *not* public, unlike the rest of the schema.
- **Insert:** Owner only (`user_id = auth.uid()`), from the authenticated session in the web UI. Any role may create a token (a `PENDING` user's token is effectively read-only).
- **Update:** Owner only, and only to set `revoked_at` (enforced by the Server Action; a trigger rejects changes to `token_hash`, `user_id`, and `scopes`).
- **Delete:** None via RLS; cascade only.
- Token lookup during API authentication uses the service-role client (see §4.7) because the API request has no Supabase session.

**`Api_Rate_Limits` Table** (fixed-window counters; keeps the $0 budget by avoiding Redis/KV)
- `bucket` (text): e.g. `token:<id>:write`, `ip:<hash>:read`.
- `window_start` (timestamptz).
- `count` (integer).
- Primary Key `(bucket, window_start)`. RLS enabled with **no** policies (service role only).
- `api_rate_limit_hit(bucket text, max_count int, window_seconds int) RETURNS TABLE(allowed boolean, remaining int, reset_at timestamptz)`: `SECURITY DEFINER` function that atomically upserts and increments the counter for the current window. Old windows are deleted opportunistically (e.g. 1% of calls delete rows older than 1 hour).

**`Api_Idempotency_Keys` Table**
- `token_id` (uuid): References `Api_Tokens(id)` on delete cascade.
- `key` (text, ≤ 255 chars).
- `request_hash` (text): SHA-256 of method + path + body, to reject reuse of a key with a different payload (`409`).
- `status` (integer) and `response` (jsonb): The stored result to replay.
- `created_at` (timestamptz). Primary Key `(token_id, key)`. Rows older than 24 hours are ignored and pruned opportunistically.
- RLS enabled with **no** policies (service role only).

## 4. Application Logic & Workflows

### 4.1 Onboarding & Authentication Flow
1. User clicks "Login with Google". Supabase handles the OAuth flow.
2. **Profile Creation:** Supabase creates a new user in `auth.users`. A Postgres `AFTER INSERT` trigger automatically generates the `Profiles` and `User_Roles` rows for the new user, setting their initial role to `PENDING`.
3. **Admin Bootstrapping:** During the user's first login redirect (e.g., hitting `/app/auth/callback/route.ts`), the Next.js route checks if the user's email matches the `INITIAL_ADMIN_EMAIL` Vercel environment variable. If it matches, the route uses the Supabase Service Role Key to elevate their `User_Roles.role` to `'ADMIN'`.
4. **Email Notification:** A Next.js Server Action is invoked to use Resend to email all `ADMIN` users notifying them of the new pending user.

### 4.2 Event Management Flow
1. An `APPROVED` user creates a new event via the Next.js frontend.
2. The frontend calls a **Next.js Server Action** to handle the mutation. The Server Action uses the Supabase client to insert the `Games` record. RLS validates the user's role natively.
3. **Email Notification:** Upon successful database insertion, the *same Server Action* immediately triggers an email via Resend to all `APPROVED` and `ADMIN` users notifying them of the new event.
4. If an event is edited, the Server Action checks if the "major change" flag was checked in the form data. If so, it dispatches a similar email notification. *This is why Server Actions are required over Database Webhooks.*

### 4.3 User Deletion
1. When an Admin decides to delete a user, simply deleting the row in `Profiles` is insufficient because the identity resides in the Supabase `auth` schema.
2. The frontend must call a secure Next.js Server Action that **explicitly verifies the requesting user has an `ADMIN` role** before calling the Supabase Admin API (`supabase.auth.admin.deleteUser()`) to delete the user. This application-layer authorization check is critical because the Service Role Key bypasses RLS. The `Profiles` row will then be automatically removed via the cascade delete.

### 4.4 iCal Feed Generation
- A Next.js API Route (e.g., `/api/calendar.ics`) generates an iCal feed dynamically from the `Games` table.
- If an optional `id` query parameter (or legacy `user_id` for backward compatibility) is provided (which can be either a profile UUID or a `vanity_name`), it resolves the user and filters the games to only those where the given user has an interest level of `REGISTERED` or `INTERESTED`.
- Since `Games` is public, this endpoint requires no authentication.

### 4.5 Athlete Vanity URLs (Vanity Names)
- **Feature Goal:** Allow athletes to choose custom, human-readable identifiers that serve as alternative profile URLs and iCal feed identifiers.
- **Database Schema Changes:** Add a `vanity_name` column to the `Profiles` table (type `TEXT`, `UNIQUE`, `NULLABLE`). Create a unique index on `vanity_name` to ensure fast lookups and database-level enforcement of uniqueness.
- **Access Authorization:** Only authenticated users with an `APPROVED` or `ADMIN` role in `User_Roles` can set, update, or clear their `vanity_name`. Users with a `PENDING` role are restricted from claiming a vanity name.
- **Validation and Slugification:**
  - Before validation and database insertion/update, the input is auto-slugified (converted to lowercase, and spaces or special characters are replaced with hyphens).
  - Validation is performed using Zod on both client and server: must match the regex `/^[a-z0-9-]+$/` (only lowercase ASCII alphanumeric characters and hyphens).
  - Must not match any user's UUID (checked against DB or UUID patterns to prevent collision).
  - Must not match a reserved routing names blocklist: `['admin', 'api', 'edit', 'new', 'settings', 'roster', 'calendar', 'dashboard', 'login', 'auth', 'public', 'feed', 'schedule', 'profile', 'logout']`.
  - Must be unique across all profiles.
- **Dynamic Routing & Resolving:**
  - The profile page route `/roster/[id]` must handle both UUIDs and vanity names.
  - Resolving logic: The application first queries `Profiles` where `vanity_name = id`. If no match is found, it checks if `id` is a valid UUID format. If it is a valid UUID, it queries `Profiles` where `id = id`. If either the UUID check fails or the query returns no results, the application renders a 404 page.
  - The iCal feed API route `/api/calendar.ics` must support `?id=[uuid]` or `?id=[vanity_name]` query parameters (as well as legacy `?user_id=[uuid]`), resolving the user profile identically to the profile page.
- **Navigation Consistency:**
  - If a profile has a `vanity_name` configured, the application *must* always use `/roster/[vanity_name]` for all navigation links (such as on the public roster list, dashboard links, and redirects) and *never* link using the profile's UUID.
- **Warning System for Changes:**
  - If a user attempts to update an already existing `vanity_name` in the profile settings, the frontend UI must display a prominent warning: *"Changing your vanity name will break any profile links and iCal subscription feeds you have previously shared."*

### 4.6 Agent API (Milestone 14)
A versioned JSON REST API under `/api/v1` lets AI agents, scripts, and cron jobs do what a member can do in the UI. The full contract is `docs/openapi.yaml` (OpenAPI 3.1, **spec-first**: the spec is written/updated first and the implementation must conform to it). The user-facing guide is `docs/API.md`.

**Why REST instead of exposing Server Actions:** Server Actions are invoked through React's internal RPC protocol and have no stable public contract. They also always return HTTP 200 with `{ success: false }` on failure, which is fine for the UI but poor for agents. The API uses real status codes and a standard error envelope (`{ error: { code, message, details? } }`).

**Shared core (single source of business rules):**
- All business logic for events, attendance, and user administration lives in `lib/core/*` as plain async functions that take an explicit `Actor` and a Supabase client:
  ```ts
  type Actor = { userId: string; role: 'PENDING' | 'APPROVED' | 'ADMIN'; scopes: Scope[] | 'session' }
  ```
  `scopes: 'session'` means a logged-in browser session (all scopes the role allows).
- Core functions perform **every** authorization check explicitly (role, scope, ownership such as "APPROVED users may only edit events they created"), validate input with the Zod schemas in `lib/schemas.ts`, perform the mutation, and send emails. They return typed results or throw typed errors (`ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`) that both callers map to their own response style.
- **Server Actions** (`app/actions/*`) become thin wrappers: resolve the session, build an Actor, call core, then `revalidatePath`. They keep using the session (anon-key) client, so **RLS still applies as defense-in-depth** for UI requests.
- **API routes** (`app/api/v1/**/route.ts`) are thin wrappers too: authenticate (§4.7), call core, then `revalidatePath`, and serialize JSON.

**Database access from the API — the critical security point:**
API requests carry a PAT, not a Supabase session, so `auth.uid()` is unavailable and RLS cannot identify the caller. The API therefore uses the **service-role client**, which bypasses RLS, exactly as `deleteUser` already does today (see §4.3). Consequences and rules:
1. The application-layer checks in `lib/core` are the **only** gate on API writes. They must be complete and covered by the authorization-matrix tests (role × scope × action × ownership).
2. Every core write must be scoped explicitly in the query (e.g. attendance upserts always set `user_id = actor.userId` from the Actor, never from the request body).
3. API routes must never pass request data straight into a Supabase query without going through core.
4. *(Alternative considered: minting short-lived Supabase JWTs per request so RLS applies. Rejected for v1: Supabase is moving projects to asymmetric signing keys that the app cannot sign with, and the HS256 legacy secret is deprecated. If Milestone 15 lands, OAuth access tokens **are** real Supabase JWTs, and those requests can use an RLS-enforced client.)*

**Conventions** (detailed in `API.md` §4): `snake_case` fields matching the DB; `start_date` as local `YYYY-MM-DD`; `start_time`/`end_time` as local `HH:MM` (the DB `time` type's seconds are dropped on output); cursor pagination (`limit` ≤ 200); partial `PATCH`; idempotent `PUT` for RSVPs; optional `Idempotency-Key` on `POST /events`.

**Notifications:** API mutations send the same Resend emails as the UI. Event creation emails by default (`notify: false` suppresses it, a new capability that is useful for routine practices); edits email only with `major_change: true`; deletes email unless `?notify=false`. The "suppress" options are also added to the core so the UI could expose them later.

**Caching:** API mutations call the same `revalidatePath('/')` / `revalidatePath('/dashboard')` as the UI. `GET` responses for unauthenticated callers may set `Cache-Control: public, s-maxage=60`; authenticated responses are `private, no-store`.

**Visibility rules for `/users`:** Unauthenticated and non-admin callers get the public roster (only `APPROVED`/`ADMIN` users; no `email` or `role`, consistent with the public roster page). Admin callers with `users:admin` get all users including `PENDING`, with `email` and `role`. A user always sees their own `email`/`role` via `/me`.

**Rate limiting:** Per token, 60 writes/min and 300 reads/min; unauthenticated reads 120/min per IP (hashed). Implemented with `api_rate_limit_hit()` (§3.5). Returns `429` with `Retry-After` and `RateLimit-*` headers.

**CORS:** No `Access-Control-Allow-Origin` for authenticated routes. The API is for server-side callers. Public `GET` routes may allow `*` without credentials.

**API documentation (generated from the spec, not duplicated):**
- `docs/openapi.yaml` is the contract. `docs/API.md` is a hand-written guide (concepts, auth, recipes, agent setup) that links to the spec instead of re-listing every field.
- `GET /api/v1/openapi.yaml` serves the spec file (read at build time).
- `GET /api/v1/docs` returns a static HTML page that loads an OpenAPI renderer (Scalar or Redoc) from a CDN and points it at the spec, so each instance has an always-current interactive reference with no new npm dependency.
- CI lints the spec (`@redocly/cli lint`) and contract tests validate responses against it to prevent drift.

### 4.7 Personal Access Tokens (PATs)
**Format:** `hcal_pat_` + 43 characters of base62 from a cryptographically secure RNG (~256 bits). The fixed prefix makes leaked tokens recognizable to secret scanners and in logs.

**Creation (web UI only):**
1. On `/dashboard/profile`, the user opens **API Tokens → Create token** and enters a name, scopes, and expiry (30/90/365 days or never). Admin-only scopes (`events:delete`, `users:admin`) are shown only to Admins.
2. A Server Action generates the token, stores `sha256(token)`, the `prefix`, scopes, and expiry in `Api_Tokens` using the **session** client (RLS: owner-only insert), and returns the plaintext once.
3. The UI shows the plaintext in a dialog with a copy button and a warning that it will not be shown again.
There is deliberately **no API endpoint to create tokens**, so a leaked token cannot mint new ones.

**Authentication of an API request (`lib/api/auth.ts`):**
1. Require `Authorization: Bearer hcal_pat_…`; otherwise, treat as anonymous (public routes) or return `401`.
2. Compute SHA-256 and look up `Api_Tokens` by `token_hash` with the service-role client. (Lookup by an indexed hash of a high-entropy secret is not timing-sensitive; no plaintext comparison is performed.)
3. Reject if not found, `revoked_at` is set, or `expires_at` has passed → `401`.
4. Load the owner's **current** role from `User_Roles` on every request (no caching), so demotions take effect immediately.
5. Build `Actor = { userId, role, scopes }`. Effective permission = role ∩ scopes (see the matrix in `API.md` §3).
6. Apply rate limits; update `last_used_at` at most once per minute per token to limit writes.
7. Never log the `Authorization` header or the plaintext token.

The helper returns a discriminated union (`{ kind: 'pat', actor } | { kind: 'anonymous' }`) so a future `{ kind: 'oauth', actor }` can be added (Milestone 15) without changing route code.

**Revocation:** From the profile page (session) or `DELETE /api/v1/tokens/{id}` (a token may revoke itself or other tokens of the same owner). Sets `revoked_at`. Deleting a user cascades and removes their tokens.

### 4.8 Future: OAuth 2.1 & MCP (Milestone 15)
- **Why not reuse Google OAuth tokens directly:** Google access tokens are issued for Google APIs, and the app never holds them — Supabase exchanges them for its own session JWT, which is what RLS understands. Validating Google tokens ourselves would mean a parallel auth system. Supabase session tokens could technically be reused, but they expire hourly and refresh-token rotation means an agent and a browser sharing a session log each other out.
- **Planned approach:** Supabase Auth's OAuth 2.1 server (public beta at time of writing) turns each instance into an OAuth provider. Agents run the authorization-code + PKCE flow, the user signs in with the existing Google button and approves a consent screen we host, and the agent receives a Supabase JWT (with a `client_id` claim) that works with existing RLS. Dynamic client registration lets MCP clients self-register.
- **Hosted MCP endpoint:** `/api/mcp` would expose the `lib/core` operations as MCP tools and accept either a PAT or an OAuth access token.
- **Constraints:** Requires per-instance Supabase dashboard configuration (enable the OAuth server and asymmetric signing keys), so it must stay **opt-in** to preserve the zero-configuration deployment promise. Supabase OAuth tokens currently carry the user's full privileges (no scopes), so PATs remain the recommended option for least-privilege automation.
- **Why PATs first:** Most agent runtimes (e.g. Hermes skills, cron jobs, CLI tools) consume static bearer tokens from environment variables and cannot complete an interactive browser OAuth flow unattended.

## 5. Next.js Application Structure
- `/app/page.tsx`: Public dashboard showing upcoming games.
- `/app/auth/callback/route.ts`: Supabase Auth callback handler and admin bootstrapper.
- `/app/api/calendar.ics/route.ts`: iCal feed generator.
- `/app/api/v1/**/route.ts`: Agent REST API route handlers (thin wrappers over `lib/core`). See `docs/openapi.yaml`.
- `/app/api/v1/openapi.yaml/route.ts` and `/app/api/v1/docs/route.ts`: Serve the spec and the rendered API reference.
- `/app/dashboard/page.tsx`: Authenticated athlete view.
- `/app/dashboard/admin/page.tsx`: Admin-only view for user management.
- `/app/dashboard/profile/page.tsx`: Profile editing, including the **API Tokens** section.
- `/app/actions/...`: Next.js Server Actions (thin wrappers over `lib/core`, plus `revalidatePath`).
- `/components/...`: Reusable UI components (buttons, forms, modals).
- `/lib/core/...`: Framework-agnostic business logic and authorization (events, attendance, users, tokens), shared by Server Actions and the API.
- `/lib/api/...`: API-only helpers: PAT authentication, rate limiting, idempotency, error/JSON responses.
- `/lib/supabase/...`: Supabase client initialization (browser, server session, and service-role admin).
- `/docs/openapi.yaml`: The API contract. `/docs/API.md`: The API usage guide.

## 6. CI/CD & Testing

### 6.1 GitHub Actions (CI)
GitHub Actions workflows must be configured to run automated checks on every pull request. This includes:
- Linting (`eslint`)
- Formatting (`prettier`)
- Type-checking (`tsc --noEmit`)
- OpenAPI spec linting (`npx @redocly/cli lint docs/openapi.yaml`) — added in Milestone 14
- Automated tests (Vitest, added in Milestone 14): including the API authorization matrix and contract tests that validate API responses against `docs/openapi.yaml`
The CI pipeline should fail and block merges if these checks do not pass.

### 6.2 Vercel (CD & Previews)
Vercel natively handles deployment and provides out-of-the-box support for **Preview Deployments**. When a PR is opened against the `main` branch, Vercel automatically detects it, builds the app, and provisions a unique, ephemeral URL for that specific PR (e.g., `https://highland-cal-git-feature-new-ui-myclub.vercel.app`). When a PR merges, Vercel deploys to Production.

### 6.3 Solving Google OAuth for Preview Deployments
Historically, Google OAuth blocks random ephemeral URLs via its "Authorized Redirect URIs" restriction and explicitly prohibits wildcard subdomains, making PR deployments difficult.
However, **Supabase completely bypasses this problem.** Because Supabase brokers the authentication, Google only ever sees the static Supabase callback URL. Supabase *does* support wildcard redirect URIs. By configuring Supabase to allow `https://*-myclub.vercel.app/**`, it securely handles OAuth for every dynamic PR URL Vercel generates.

### 6.4 Preview Deployment Database Isolation
The primary risk with Preview Deployments is that if Vercel uses production environment variables, PR reviewers will interact with the *live production database* (e.g., testing the "Delete Event" feature would delete a real event).
To safely isolate PR testing:
1. Create a second, free Supabase project to serve as the "Development/Staging" database.
2. In Vercel's settings, define Environment Variables specifically for the "Preview" environment.
3. Supply the Development Supabase URL and Keys for the "Preview" environment, ensuring reviewers test against safe data.
