# Highland Cal - Detailed Technical Design Document

## 1. Overview
Highland Cal is a decentralized, self-hosted web application built for Highland Games throwing clubs to coordinate attendance, track events, and manage athlete profiles. This document specifies the technical implementation details required to build the project, acting as a blueprint for an LLM or human developer.

## 2. Tech Stack & Architecture
- **Frontend / API:** Next.js (App Router, React, Tailwind CSS, `shadcn/ui` for components, `react-hook-form` and `zod` for forms)
- **iCal Generation:** `ics` npm package
- **Database / Auth:** Supabase (PostgreSQL, Row Level Security, Auth)
- **Authentication Provider:** Google OAuth 2.0 (Federated, Zero Password)
- **Email Service:** Resend with `react-email` templates
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
- Since `Games` is public, this endpoint requires no authentication.

## 5. Next.js Application Structure
- `/app/page.tsx`: Public dashboard showing upcoming games.
- `/app/auth/callback/route.ts`: Supabase Auth callback handler and admin bootstrapper.
- `/app/api/calendar.ics/route.ts`: iCal feed generator.
- `/app/dashboard/page.tsx`: Authenticated athlete view.
- `/app/dashboard/admin/page.tsx`: Admin-only view for user management.
- `/components/...`: Reusable UI components (buttons, forms, modals).
- `/lib/actions/...`: Next.js Server Actions for database mutations and sending Resend emails.
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
