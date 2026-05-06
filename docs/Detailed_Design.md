# Highland Cal - Detailed Technical Design Document

## 1. Overview
Highland Cal is a decentralized, self-hosted web application built for Highland Games throwing clubs to coordinate attendance, track events, and manage athlete profiles. This document specifies the technical implementation details required to build the project, acting as a blueprint for an LLM or human developer.

## 2. Tech Stack & Architecture
- **Frontend / API:** Next.js (App Router, React, Tailwind CSS for styling)
- **Database / Auth:** Supabase (PostgreSQL, Row Level Security, Auth)
- **Authentication Provider:** Google OAuth 2.0 (Federated, Zero Password)
- **Email Service:** Resend
- **Hosting:** Vercel

## 3. Database Schema & RLS Policies (PostgreSQL)

### 3.1 `Profiles` Table
Stores extended user information.
- `id` (uuid, Primary Key): References `auth.users(id)` on delete cascade.
- `display_name` (text): Athlete's name.
- `email` (text): Athlete's email address (synced from auth).
- `class` (text): Competition class (e.g., A-Class, Masters, Women).
- `status` (text): Account status. Enum: `['PENDING', 'APPROVED', 'ADMIN']`. Default: `PENDING`.
- `outward_links` (jsonb): Social media and external profile links.
- `created_at` (timestamptz): Default `now()`.

**RLS Policies (`Profiles`):**
- **Read:** Publicly readable (to serve as a club roster).
- **Update:** Users can update their own row (`id = auth.uid()`). 
  - *Crucial Implementation Detail:* Standard RLS cannot prevent column-level updates. To enforce that users CANNOT update their own `status`, you must implement a `BEFORE UPDATE` Postgres trigger that raises an exception if `NEW.status IS DISTINCT FROM OLD.status` unless the requesting user has an `'ADMIN'` status.
- **Admin Update:** Users with `status = 'ADMIN'` can update the `status` of other users.

### 3.2 `Games` Table
Stores upcoming games and practices.
- `id` (uuid, Primary Key): Default `uuid_generate_v4()`.
- `name` (text): Name of the game or practice.
- `date` (date): Date of the event.
- `start_time` (time): Optional start time of the event.
- `end_time` (time): Optional end time of the event.
- `timezone` (text): Timezone identifier (e.g., 'America/Los_Angeles').
- `location` (text): Location (City, State).
- `registration_url` (text): External registration link.
- `created_by` (uuid): References `Profiles(id)`.
- `created_at` (timestamptz): Default `now()`.

**RLS Policies (`Games`):**
- **Read:** Publicly readable (acts as a marketing tool).
- **Insert/Update:** Allowed if the requesting user's `status` is `'APPROVED'` or `'ADMIN'`. 
  - *Recursion Warning:* To check the status, use a `SECURITY DEFINER` function (e.g., `get_user_status()`) inside the RLS policy to avoid infinite recursion when querying the `Profiles` table.
- **Delete:** Allowed only if the requesting user's `status` is `'ADMIN'`.

### 3.3 `Attendance` Table
Tracks RSVPs.
- `id` (uuid, Primary Key): Default `uuid_generate_v4()`.
- `user_id` (uuid): References `Profiles(id)` on delete cascade.
- `game_id` (uuid): References `Games(id)` on delete cascade.
- `interest_level` (text): Enum: `['WATCHING', 'INTERESTED', 'REGISTERED', 'NOT_GOING']`.
- `updated_at` (timestamptz): Default `now()`.
- **Constraint:** Unique constraint on `(user_id, game_id)`.

**RLS Policies (`Attendance`):**
- **Read:** Publicly readable.
- **Insert/Update/Delete:** Allowed only if `user_id = auth.uid()` AND the user's `status` is `'APPROVED'` or `'ADMIN'`. If a user's status is revoked to `'PENDING'`, their past attendance records are frozen (read-only).
  - *Recursion Warning:* Similar to `Games`, use a `SECURITY DEFINER` function to check user status in this RLS policy to prevent infinite recursion.

## 4. Application Logic & Workflows

### 4.1 Onboarding & Authentication Flow
1. User clicks "Login with Google". Supabase handles the OAuth flow.
2. **Auth Callback Bootstrapping:** After successful authentication, the user is redirected back to the Next.js application (e.g., `/app/auth/callback/route.ts`).
   - This route ensures a new row is inserted into the `Profiles` table for the user.
   - **Admin Bootstrapping:** Since Postgres triggers cannot access Vercel environment variables, this Next.js route checks if the user's email matches the `INITIAL_ADMIN_EMAIL` Vercel environment variable. If so, it uses the Supabase Service Role Key to set their `status` to `'ADMIN'`. Otherwise, it defaults to `'PENDING'`.
3. **Email Notification:** Once the profile is created, the system uses Resend to email all `ADMIN` users to notify them of the new pending user. This can be handled directly in the callback route or via a webhook.

### 4.2 Event Management Flow
1. An `APPROVED` user creates a new event via the Next.js frontend.
2. The frontend calls Supabase to insert the `Games` record. RLS validates the user's status.
3. **Email Notification:** Upon successful insertion, a Supabase Database Webhook triggers an email via Resend to all `APPROVED` and `ADMIN` users notifying them of the new event.
4. If an event is edited and the "major change" flag is set, a similar email notification is dispatched.

### 4.3 User Deletion
1. When an Admin decides to delete a user, simply deleting the row in `Profiles` is insufficient because the identity resides in the Supabase `auth` schema.
2. The frontend must call a secure Next.js Server Action that uses the Supabase Admin API (`supabase.auth.admin.deleteUser()`) to delete the user. The `Profiles` row will then be automatically removed via the cascade delete.

### 4.4 iCal Feed Generation
- A Next.js API Route (e.g., `/api/calendar.ics`) generates an iCal feed dynamically from the `Games` table.
- Since `Games` is public, this endpoint requires no authentication.

## 5. Next.js Application Structure
- `/app/page.tsx`: Public dashboard showing upcoming games.
- `/app/auth/callback/route.ts`: Supabase Auth callback handler and admin bootstrapper.
- `/app/api/calendar/route.ts`: iCal feed generator.
- `/app/api/webhooks/new-user/route.ts`: Secure endpoint called by Supabase Database Webhooks. Queries admins and dispatches Resend email.
- `/app/api/webhooks/new-event/route.ts`: Secure endpoint called by Supabase Database Webhooks to dispatch new event emails.
- `/app/dashboard/page.tsx`: Authenticated athlete view.
- `/app/dashboard/admin/page.tsx`: Admin-only view for user management.
- `/components/...`: Reusable UI components (buttons, forms, modals).
- `/lib/supabase/...`: Supabase client initialization (browser and server).

## 6. CI/CD & Testing

### 6.1 GitHub Actions (CI)
GitHub Actions workflows must be configured to run automated checks on every pull request. This includes:
- Linting (`eslint`)
- Formatting (`prettier`)
- Automated tests
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
