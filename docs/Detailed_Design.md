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

> **Note (Milestone 14):** The policies below are written in terms of `auth.uid()` as originally designed. Milestone 14 redefines them in terms of `current_actor_id()` and `has_scope()` so that they also govern API tokens. Browser behavior is unchanged. See §3.6.

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

**RLS Policies & Grants (`Api_Tokens`):**
- **Read:** Owner only (`user_id = (select current_actor_id())`), so both the profile page (session) and `GET /api/v1/tokens` (PAT) can list them. Tokens are *not* public, unlike the rest of the schema. Table-level `SELECT` is revoked from `anon`/`authenticated` and re-granted only on the non-secret columns, so `token_hash` is never selectable.
- **Insert:** `is_session() AND user_id = auth.uid()`. A PAT can never create a token, so a leaked token cannot mint more. Any role may create a token; a `PENDING` user's token is effectively read-only.
- **Update:** **No `UPDATE` grant and no `UPDATE` policy.** Revocation goes only through the RPC `revoke_api_token(token_id uuid)` (`SECURITY DEFINER`). It runs `UPDATE … SET revoked_at = now() WHERE id = token_id AND user_id = current_actor_id() AND revoked_at IS NULL` and returns whether a row changed. Revocation is therefore **irreversible**: no caller can set `revoked_at` back to `NULL` or change `token_hash`, `user_id`, `scopes`, or `expires_at`. Revoking is allowed from a session or from any live token of the same owner, because it only ever reduces access.
- **Delete:** No policy. Rows go away only by cascade when the user is deleted.

**`Api_Rate_Limits` Table** (fixed-window counters; keeps the $0 budget by avoiding Redis/KV)
- `bucket` (text): e.g. `token:<id>:write`, `ip:<hash>:read`.
- `window_start` (timestamptz).
- `count` (integer).
- Primary Key `(bucket, window_start)`. RLS enabled with **no** policies and no grants. Only reachable through the `SECURITY DEFINER` function `api_authenticate()` (§3.6).

**`Api_Idempotency_Keys` Table**
- `token_id` (uuid): References `Api_Tokens(id)` on delete cascade.
- `key` (text, ≤ 255 chars).
- `request_hash` (text): SHA-256 of method + path + body, to reject reuse of a key with a different payload (`409`).
- `status` (integer) and `response` (jsonb): The stored result to replay.
- `created_at` (timestamptz). Primary Key `(token_id, key)`. Rows older than 24 hours are ignored and pruned opportunistically.
- RLS enabled. Policies allow `SELECT`/`INSERT`/`UPDATE` only where `token_id = (select (request_token()).id)`, so each token sees only its own keys. No `DELETE`; pruning happens inside `api_authenticate()`.

**Atomic idempotent create (`api_create_event(payload jsonb, idem_key text, request_hash text)`):**
`POST /events` with an `Idempotency-Key` calls this RPC instead of inserting into `Games` directly. It is **`SECURITY INVOKER`**, so the `Games` insert still runs under the caller's RLS. PostgREST runs each RPC in a single transaction, so these steps commit or roll back together:
1. `INSERT INTO Api_Idempotency_Keys (token_id, key, request_hash) … ON CONFLICT DO NOTHING`. A concurrent retry with the same key **blocks** on the primary-key conflict until the first transaction commits or rolls back.
2. If the key already existed: if `request_hash` differs, raise `idempotency_conflict` (→ `409`). Otherwise return the stored `status`/`response` without inserting anything.
3. Otherwise insert the `Games` row (RLS-checked; a violation rolls back the key claim too), store the result in the key row, and return it.
A crash after step 3 but before commit rolls back everything, including the key claim, so a retry starts clean. Because notifications are written to the outbox (§3.7) by a trigger **inside this same transaction**, a replayed request never creates a second notification. Requests without an `Idempotency-Key` insert directly.

### 3.6 Token-Aware Row Level Security (Milestone 14)
**Principle: RLS is the single source of authorization for both the web UI and the Agent API.** The application never re-implements the permission model. App-side checks may exist only to produce friendlier error messages, and must never be the thing that grants access.

**How a PAT reaches Postgres:** The API route uses the ordinary **anon-key** Supabase client (no service role) and forwards the caller's token in a custom header, `x-hcal-token`. PostgREST exposes request headers to SQL via `current_setting('request.headers', true)::json`, so RLS policies can authenticate the token themselves.

**Identity functions** (all `STABLE`, `SECURITY DEFINER`, `SET search_path = public`, `EXECUTE` granted to `anon`/`authenticated`):

| Function | Returns |
| :--- | :--- |
| `request_token()` | The valid `Api_Tokens` row for the `x-hcal-token` header: match on `token_hash = encode(sha256(convert_to(header,'UTF8')),'hex')`, `revoked_at IS NULL`, and `expires_at` NULL or in the future. Otherwise NULL. Always NULL when `auth.uid()` is set: a browser session always takes precedence and a token is ignored, so the two can't be mixed. |
| `current_actor_id()` | `coalesce(auth.uid(), (request_token()).user_id)`: the user this request acts as. |
| `is_session()` | `auth.uid() IS NOT NULL`: a logged-in browser session. |
| `has_scope(s text)` | `true` for a session (a session has every scope its role allows); for a PAT, `s = ANY((request_token()).scopes)`; otherwise `false`. **This is the single extension point for Milestone 15:** OAuth tokens are real Supabase JWTs, so `auth.uid()` already works and `has_scope` would additionally read their scope claim. |

`is_admin()` and `is_approved_or_admin()` are redefined (`CREATE OR REPLACE`) to look up the role of `current_actor_id()` instead of `auth.uid()`. The owner's role is read live on every request, so demotions and deletions take effect immediately for tokens too.

**Policy rewrite** (in the new migration: `DROP POLICY` + `CREATE POLICY`; the initial migration is never edited). Wrap every function call as `(select fn())` so Postgres evaluates it once per statement, not once per row. This is Supabase's recommended RLS performance pattern.

| Table / op | New policy |
| :--- | :--- |
| `Games` insert | `is_approved_or_admin() AND has_scope('events:write') AND created_by = current_actor_id()` |
| `Games` update | `has_scope('events:write') AND (is_admin() OR (is_approved_or_admin() AND created_by = current_actor_id()))` |
| `Games` delete | `is_admin() AND has_scope('events:delete')` |
| `Attendance` insert/update/delete | `user_id = current_actor_id() AND is_approved_or_admin() AND has_scope('attendance:write')` |
| `User_Roles` update | `is_admin() AND has_scope('users:admin')` |
| `Settings` all | `is_admin() AND is_session()`: not exposed via the API, so tokens get no access |
| `Profiles` update | unchanged (`auth.uid() = id`): session only, not exposed via the API |
| Storage policies | `AND is_session()` added wherever they call `is_admin()` / `is_approved_or_admin()` |
| Public `SELECT` policies | unchanged |

For browser sessions every new predicate reduces exactly to today's behavior (`current_actor_id() = auth.uid()`, `has_scope() = true`), so **the web UI's permissions do not change**.

**Policy invariant (drift guard):** Any policy that grants a write based on `is_admin()`, `is_approved_or_admin()`, or `current_actor_id()` **must** also include either `has_scope(…)` or `is_session()`. Otherwise, adding a new table later could silently give every token write access. A pgTAP test (§6.1) scans `pg_policies` and fails CI if any policy breaks this rule. All write policies defined in this milestone satisfy it, including `Api_Tokens` insert (`is_session()`). Token revocation is deliberately an RPC rather than an `UPDATE` policy (§3.5).

**`SECURITY DEFINER` functions bypass RLS, so they get their own guard.** The same pgTAP suite lists every `SECURITY DEFINER` function in `public` that client roles can execute (from `pg_proc` + `has_function_privilege`) and compares it with an explicit allowlist in the test file:
- the identity helpers
- `api_authenticate`
- `api_rate_limit_anonymous`
- `revoke_api_token`
- `authorize_user_deletion`
- `get_user_private`
- `vanity_name`/role trigger functions
Adding a new one fails CI until it is reviewed and added to the list. Each allowlisted write function also has dedicated pgTAP cases.

**Other API-support functions** (`SECURITY DEFINER`, `VOLATILE`):
- `api_authenticate()` is called once at the start of every authenticated API request. It validates the header token (raising `invalid_token` → `401`), applies rate limits via `Api_Rate_Limits`, updates `last_used_at` (at most once per minute), and returns `{ user_id, role, scopes, token_id, rate_limit_remaining, rate_limit_reset }`. The route uses the result for `401`/`429`, for `/me`, and for friendly `403` messages. It does **not** use the result for authorization; RLS does that on the actual query.
- `authorize_user_deletion(target uuid)` raises `insufficient_privilege` unless `is_admin() AND has_scope('users:admin') AND target <> current_actor_id()`. See §4.3.

**Accepted consequence:** Because PATs are evaluated inside Postgres, a token holder could also call Supabase's PostgREST endpoint directly (the anon key is public by design) with the `x-hcal-token` header. That grants **no additional permissions**, because the same RLS applies. It does bypass the Next.js layer's rate limits and email notifications. That is acceptable for v1: a token can only do what its owner can already do. If it becomes a problem, add a PostgREST `db_pre_request` check.


### 3.7 Notification Outbox (Milestone 14)
Notifications are **recorded in the database in the same transaction as the change**, and **delivered by trusted server-only code**. Callers never need to read other members' email addresses, so recipient lookup does not weaken RLS, and retries or replays can't duplicate emails.

**`Notification_Outbox` Table** (RLS enabled, **no** policies and **no** grants to `anon`/`authenticated`)
- `id` (uuid PK), `kind` (`NEW_REGISTRATION` | `USER_APPROVED` | `EVENT_CREATED` | `EVENT_UPDATED` | `EVENT_DELETED`), `subject_id` (uuid: user or game), `payload` (jsonb: snapshot of the event/user fields needed for the email, captured at write time so deletes still render), `created_at`, `sent_at` (nullable), `attempts` (int), `last_error` (text).

**Writers: `SECURITY DEFINER` triggers only.** They fire only on writes that RLS has already allowed:
- `Games` `AFTER INSERT` → `EVENT_CREATED`, unless the request header `x-hcal-notify` is `false`.
- `Games` `AFTER UPDATE` → `EVENT_UPDATED`, only if the request header `x-hcal-major-change` is `true`.
- `Games` `AFTER DELETE` → `EVENT_DELETED`, unless `x-hcal-notify` is `false`.
- `User_Roles` `AFTER UPDATE` where `role` changes `PENDING → APPROVED` → `USER_APPROVED`.
- `handle_new_user()` (existing signup trigger) → `NEW_REGISTRATION`. This replaces the "created within the last 60 seconds" heuristic in the auth callback.
The flags travel as headers so both entry points work the same way. Server Actions set them on their per-request session client, and API routes map `notify` / `major_change` from the request body onto them. A member calling PostgREST directly could set these headers too, but that only lets them do what the UI checkbox already allows for events they can edit.

**Delivery: `lib/notifications/dispatch.ts` (server-only).**
- Claims unsent rows with `SELECT … FOR UPDATE SKIP LOCKED`, resolves recipients (all `APPROVED`/`ADMIN` emails, or the `ADMIN` emails for registrations), sends via Resend, and sets `sent_at`. On failure it increments `attempts` and records `last_error`, giving up after 5 tries.
- **It uses the service-role client, but takes no caller input.** It only drains the outbox, so it cannot be made to email arbitrary content or recipients. This is the second and final sanctioned service-role use, alongside `auth.admin.deleteUser()`.
- **Triggered** right after every successful mutation (Server Actions and API routes) via Next.js `after()`, so emails go out promptly without delaying the response. A daily Vercel Cron job (`/api/cron/notifications`, protected by `CRON_SECRET`, within Hobby-plan limits) drains anything left over.
- **Edge cases:**
  - At-least-once delivery: a crash between Resend accepting a message and `sent_at` being written can cause one duplicate send. Pass the outbox `id` as Resend's idempotency key to prevent this.
  - Server Actions keep the existing behavior: emails are sent only when the email env vars are configured. Otherwise rows are marked `sent_at` with `last_error = 'email disabled'`.

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
2. The frontend must call a secure Next.js Server Action that verifies the requesting user is allowed to delete users before calling the Supabase Admin API (`supabase.auth.admin.deleteUser()`). The `Profiles` row will then be automatically removed via the cascade delete.
3. **The permission decision is made in the database, not in app code** (Milestone 14). Both the Server Action (session client) and `DELETE /api/v1/users/{id}` (anon client + `x-hcal-token`) first call the RPC `authorize_user_deletion(target)` (§3.6). Only if it succeeds does the code create the service-role client, and it uses it **only** for the single `auth.admin.deleteUser()` call. This is the one place the service-role key is used for a user-initiated action, because Supabase offers no RLS-governed way to delete an `auth.users` identity.

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

**Authorization lives in the database (RLS), not in the API.**
The API does **not** re-implement the permission model. Every API request runs against the database as the token's owner through the token-aware RLS described in §3.6, the same policies that govern the web UI. Rules:
1. **No service-role client in API routes**, with two narrowly scoped exceptions, neither of which makes a permission decision: the `auth.admin.deleteUser()` call, made only after the database has authorized it (§4.3); and the notification dispatcher, which takes no caller input and only drains the outbox (§3.7).
2. Routes build an anon-key client that sends the caller's token as `x-hcal-token` (`lib/api/supabase.ts`), and run every read and write through it.
3. App code may *pre-check* (using the role/scopes returned by `api_authenticate()`) to return a precise message such as "Only admins can delete events". Pre-checks are advisory: if a pre-check and RLS disagree, RLS wins, and the drift shows up as a wrong error message, never a security hole.
4. Writes are still scoped explicitly where natural (e.g. attendance upserts set `user_id` from `api_authenticate()`, never from the request body), but this is belt-and-braces: RLS would reject anything else.

**Mapping RLS outcomes to HTTP:**
- An `INSERT` that violates a policy raises SQLSTATE `42501` → `403 forbidden`.
- An `UPDATE`/`DELETE` that a policy filters out affects **0 rows** silently. Routes therefore use `.select()` on mutations (returning the affected rows) and, when nothing came back, re-read the row: if it exists (all event/attendance reads are public) → `403`; if not → `404`.
- Errors raised by `api_authenticate()` → `401` (invalid token) or `429` (rate limited).

**Shared request logic (no authorization):** `lib/core/*` holds the logic shared by Server Actions and API routes: Zod validation (`lib/schemas.ts`), building the DB payload and notification headers, performing the query with **the client it is given** (session client from Server Actions, token client from the API), mapping RLS outcomes to typed errors (`ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`), and kicking the notification dispatcher via `after()`. Server Actions and routes then handle `revalidatePath` and response formatting. `lib/core` contains no "is this user allowed?" logic of record and never reads other users' private data.

*(Alternatives considered: (a) the service-role client plus app-level checks. Rejected because it duplicates RLS in TypeScript and would drift. (b) Minting short-lived Supabase JWTs per request. Rejected because Supabase is moving projects to asymmetric signing keys the app can't sign with, and the HS256 legacy secret is deprecated.)*

**Conventions** (detailed in `API.md` §4): `snake_case` fields matching the DB; `start_date` as local `YYYY-MM-DD`; `start_time`/`end_time` as local `HH:MM` (the DB `time` type's seconds are dropped on output); cursor pagination (`limit` ≤ 200); partial `PATCH`; idempotent `PUT` for RSVPs; optional `Idempotency-Key` on `POST /events`.

**Notifications:** API mutations produce the same emails as the UI via the notification outbox (§3.7). Rows are written by database triggers in the same transaction as the change, then delivered by the server-only dispatcher. Event creation emails by default (`notify: false` suppresses it, a new capability that is useful for routine practices); edits email only with `major_change: true`; deletes email unless `?notify=false`. These flags reach the triggers as the `x-hcal-notify` / `x-hcal-major-change` headers, and the UI could expose "suppress" later using the same headers.

**Caching:** API mutations call the same `revalidatePath('/')` / `revalidatePath('/dashboard')` as the UI. `GET` responses for unauthenticated callers may set `Cache-Control: public, s-maxage=60`; authenticated responses are `private, no-store`.

**Visibility rules for `/users`:** Unauthenticated and non-admin callers get the public roster (only `APPROVED`/`ADMIN` users, without `email` or `role`, consistent with the public roster page). Admin callers with `users:admin` get all users including `PENDING`, with `email` and `role`. A user always sees their own `email`/`role` via `/me`.

**Private profile fields (closes a pre-existing exposure):** Today `Profiles` has a public `SELECT` policy and the default table-level grant, so `email`, `throwing_experience`, and `attended_practice` (application answers) can be read by anyone through PostgREST with the public anon key. PostgreSQL privileges are additive, so revoking a single column is **not** enough while a table-level grant exists. The migration must therefore:
1. `REVOKE SELECT ON public.Profiles FROM anon, authenticated;`
2. `GRANT SELECT (id, display_name, class, outward_links, avatar_url, vanity_name, created_at) ON public.Profiles TO anon, authenticated;`, the explicit public column allowlist. Future public columns must be added to this grant.
3. Expose private fields only through `get_user_private(ids uuid[])`, a `SECURITY DEFINER` function returning `id, email, throwing_experience, attended_practice` for rows where `id = current_actor_id()` (self), **or** for any row when `is_admin() AND has_scope('users:admin')`. An Admin's token without `users:admin` sees only its own private fields. Browser sessions satisfy `has_scope()`, so the admin dashboard works unchanged.
4. App code that selects `*` or the private columns from `profiles` must switch to explicit public columns plus `get_user_private()`. Today that's the dashboard application status, the admin dashboard, and `lib/email.ts`. Email recipient lookup moves entirely into the server-only notification dispatcher (§3.7), which never runs with a caller's privileges.
5. `User_Roles` stays publicly readable. Roles are already shown on the public roster.

**Rate limiting:** Per token, 60 writes/min and 300 reads/min, enforced inside `api_authenticate()` (§3.6). Unauthenticated reads are limited to 120/min per IP (hashed) by a lightweight `api_rate_limit_anonymous()` RPC. Returns `429` with `Retry-After` and `RateLimit-*` headers. Rate limiting is traffic control, not authorization, so it is fine for it to live in the API layer.

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
2. A Server Action generates the token, stores `sha256(token)`, the `prefix`, scopes, and expiry in `Api_Tokens` using the **session** client (RLS: session-only, owner-only insert), and returns the plaintext once. A `CHECK`/trigger rejects admin-only scopes on tokens whose owner is not an `ADMIN`. Even if one slipped through, it would be inert, because policies require both `is_admin()` and `has_scope()`.
3. The UI shows the plaintext in a dialog with a copy button and a warning that it will not be shown again.
There is deliberately **no API endpoint to create tokens**, so a leaked token cannot mint new ones.

**Authentication of an API request (`lib/api/auth.ts`):**
1. Read `Authorization: Bearer hcal_pat_…` from the incoming HTTP request. If it's absent, the request is anonymous: public routes proceed, and protected routes return `401`.
2. Create an anon-key Supabase client with the global header `x-hcal-token: <token>` (never the service role).
3. Call `rpc('api_authenticate')`. The **database** validates the token (hash match, not revoked, not expired), enforces rate limits, updates `last_used_at`, and returns the owner's live role and the token's scopes. Errors map to `401` / `429`.
4. Hand the token-bound client and the returned identity to the route. The identity is used for `/me`, `user_id` on RSVPs, and friendly error messages. **Every permission decision is made by RLS** when the route runs its actual query with that client (§3.6, §4.6).
5. Never log the `Authorization` header, the `x-hcal-token` header, or the plaintext token.

The helper returns a discriminated union (`{ kind: 'pat', client, identity } | { kind: 'anonymous', client }`) so a future `{ kind: 'oauth', … }` (Milestone 15) can be added without changing route code. OAuth tokens are real Supabase JWTs, so they would be passed as the normal `Authorization` header and `auth.uid()` would work natively.

**Revocation:** From the profile page (session) or `DELETE /api/v1/tokens/{id}` (a token may revoke itself or other tokens of the same owner). Both call the `revoke_api_token()` RPC (§3.5), which sets `revoked_at` irreversibly. The very next request with that token fails inside `request_token()`. Deleting a user cascades and removes their tokens.

### 4.8 Future: OAuth 2.1 & MCP (Milestone 15)
- **Why not reuse Google OAuth tokens directly:** Google access tokens are issued for Google APIs, and the app never holds them — Supabase exchanges them for its own session JWT, which is what RLS understands. Validating Google tokens ourselves would mean a parallel auth system. Supabase session tokens could technically be reused, but they expire hourly and refresh-token rotation means an agent and a browser sharing a session log each other out.
- **Planned approach:** Supabase Auth's OAuth 2.1 server (public beta at time of writing) turns each instance into an OAuth provider. Agents run the authorization-code + PKCE flow, the user signs in with the existing Google button and approves a consent screen we host, and the agent receives a Supabase JWT (with a `client_id` claim) that works with existing RLS. Dynamic client registration lets MCP clients self-register.
- **Hosted MCP endpoint:** `/api/mcp` would expose the `lib/core` operations as MCP tools and accept either a PAT or an OAuth access token. Authorization would still come solely from RLS: OAuth JWTs make `auth.uid()` work natively, and `has_scope()` (§3.6) gains a branch that reads the token's scope claim.
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
- `/lib/core/...`: Shared request logic (validation, payloads, queries via the caller-supplied client, RLS-outcome → error mapping, emails) used by Server Actions and the API. **Contains no authorization of record**; RLS is the authority.
- `/lib/api/...`: API-only helpers: building the token-bound anon client, calling `api_authenticate()`, idempotency, error/JSON responses.
- `/supabase/tests/...`: pgTAP tests for RLS policies and the policy invariant.
- `/lib/supabase/...`: Supabase client initialization (browser, server session, and service-role admin).
- `/docs/openapi.yaml`: The API contract. `/docs/API.md`: The API usage guide.

## 6. CI/CD & Testing

### 6.1 GitHub Actions (CI)
GitHub Actions workflows must be configured to run automated checks on every pull request. This includes:
- Linting (`eslint`)
- Formatting (`prettier`)
- Type-checking (`tsc --noEmit`)
- OpenAPI spec linting (`npx @redocly/cli lint docs/openapi.yaml`) — added in Milestone 14
- **Database tests (pgTAP via `supabase test db`, added in Milestone 14)**: the authorization matrix is tested **at the database level**, where it is enforced. For each combination of caller (anonymous, session, PAT) × role (`PENDING`/`APPROVED`/`ADMIN`) × scopes × ownership × operation, the tests set `request.jwt.claims` / `request.headers` and assert the operation is allowed or denied. Also tested: expired and revoked tokens, a session taking precedence over a header token, the **policy invariant** scan of `pg_policies` (§3.6), and that `Api_Tokens.token_hash` is not selectable. CI runs these against a local Supabase stack (`supabase start` in GitHub Actions).
- Automated tests (Vitest, added in Milestone 14): API route behavior (status-code mapping, error envelope, idempotency, rate-limit headers) and contract tests that validate API responses against `docs/openapi.yaml`. These do **not** re-test permissions; that's the pgTAP suite's job.
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
