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
- [x] Create a `database/schema.sql` file containing all table definitions (`Profiles`, `User_Roles`, `Games`, `Attendance`), custom ENUMs, the `is_admin()` security definer function, Row Level Security policies, and the `AFTER INSERT` trigger (with its associated function) on `auth.users`.
- [x] Set up the Supabase client utilities in the Next.js app (e.g., `/lib/supabase/server.ts`, `/lib/supabase/client.ts`).
- [x] Configure local environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Note: Ensure the Service Role Key is never prefixed with `NEXT_PUBLIC_`.
- [x] Create a simple database health check component or route to confirm the application can successfully query Supabase.
**Runnable State:** 
- The application successfully connects to a provisioned Supabase instance. 
- The `schema.sql` can be successfully executed in the Supabase SQL Editor without errors.

---

## Milestone 3: Authentication & Admin Bootstrapping
**Goal:** Implement Google OAuth login, the onboarding data flow, and the initial Admin bootstrapping mechanism.
**References:** 
- `User_Journeys.md` > Journey 2: Frictionless Onboarding & Pending Approval
- `User_Journeys.md` > Journey 6: Instance Deployment & Setup
- `Detailed_Design.md` > 4.1 Onboarding & Authentication Flow
**Tasks:**
- [ ] Add a "Login with Google" button to the UI, wiring it to Supabase Auth.
- [ ] Implement the auth callback route (e.g., `/app/auth/callback/route.ts`) to handle the OAuth redirect and session exchange.
- [ ] Implement the **Admin Bootstrapping** logic in the callback: Check if the logging-in user's email matches `process.env.INITIAL_ADMIN_EMAIL` and they do not already have the `ADMIN` role. If so, use the Service Role Key to elevate their role in `User_Roles` to `ADMIN`.
- [ ] Create a basic authenticated `/app/dashboard/page.tsx` that displays the user's current role (`PENDING`, `APPROVED`, `ADMIN`).
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
- [ ] Update `/app/page.tsx` to fetch and display the list of upcoming Games from the `Games` table. This must be accessible without authentication (relying on the public RLS policy).
- [ ] Implement `/app/api/calendar.ics/route.ts` to serialize the `Games` table into a valid iCal feed using the `ics` npm package (include Cache-Control headers to optimize performance).
- [ ] Add a "Subscribe to Calendar" button on the public page that links to the `.ics` route.
**Runnable State:** 
- Unauthenticated visitors can see a chronologically sorted list of games (using mock data inserted manually into Supabase). 
- Users can successfully download/subscribe to the `.ics` feed.

---

## Milestone 5: Event Management (Delete & Basic UI)
**Goal:** Provide the basic UI to view the schedule from the dashboard and allow Admins to delete events.
**References:** 
- `User_Journeys.md` > Journey 8: Event Cleanup
**Tasks:**
- [ ] Create the event list view on the authenticated dashboard.
- [ ] Implement a Next.js Server Action for deleting records from the `Games` table (ensure strict server-side authorization checks for each action).
- [ ] Ensure the frontend respects user roles (the Delete button should only render for `ADMIN` users).
- [ ] *Note:* Stub out the Resend email notifications with `console.log()` for now to isolate concerns.
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
- [ ] Create a "Create Event" form/modal on the authenticated dashboard using `react-hook-form` and `zod` for validation.
- [ ] Create an "Edit Event" form/modal (ensure the "major change" checkbox is included in the UI state).
- [ ] Implement Next.js Server Actions for inserting and updating records in the `Games` table (ensure strict server-side authorization checks for each action).
- [ ] *Note:* Continue to stub out Resend email notifications.
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
- [ ] Build the Attendance UI component, embedded within the event view on the authenticated dashboard.
- [ ] Allow `APPROVED` users to select/update their `interest_level` (`WATCHING`, `INTERESTED`, `REGISTERED`, `NOT_GOING`).
- [ ] Display an aggregated summary of who is attending the event.
- [ ] Ensure RLS policies restrict attendance modification strictly to `auth.uid()`.
**Runnable State:** 
- Authenticated users can set and change their RSVP status. 
- The UI dynamically updates to reflect their selection and lists other attendees.

---

## Milestone 8: Personal Profile Management (Journey 5)
**Goal:** Allow users to maintain their public persona and competition details.
**References:** 
- `User_Journeys.md` > Journey 5: Managing Personal Profile
**Tasks:**
- [ ] Create a dedicated `/app/dashboard/profile` page.
- [ ] Build a form using `react-hook-form` and `zod` to update the user's `class` and `outward_links` (JSONB). The form should explicitly include inputs for Instagram and Facebook, and allow up to 5 additional custom links.
- [ ] Implement a Server Action to securely update the `Profiles` table for the authenticated user.
- [ ] Create a public roster view or profile card component so the club can show off its athletes.
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
- [ ] Create an `/app/dashboard/admin/page.tsx` view, strictly gated to `ADMIN` users.
- [ ] Fetch and display a list of all users and their current roles from `Profiles` joined with `User_Roles`.
- [ ] Implement secure Server Actions to:
  - [ ] Approve a `PENDING` user (updates to `APPROVED`).
  - [ ] Promote an `APPROVED` user to `ADMIN`.
  - [ ] Delete a user (must use the Supabase Admin API via the Service Role Key to remove the identity from `auth.users`; ensure `ON DELETE CASCADE` is configured on related tables).
**Runnable State:** 
- The Admin can view the user list, approve new registrations (granting them immediate write access), and permanently delete users.

---

## Milestone 10: Email Notifications Integration
**Goal:** Replace the stubbed notification logs with live transactional emails via Resend.
**References:** 
- `Detailed_Design.md` > 4.3 Notifications (Next.js Server Actions)
**Tasks:**
- [ ] Integrate the Resend Node.js SDK and `react-email` for building HTML email templates.
- [ ] Wire up the **New User Registration** email (triggered during onboarding, sent to Admins).
- [ ] Wire up the **User Approved** email (triggered by Admin action, sent to Athlete).
- [ ] Wire up the **New Event / Major Edit** email (triggered by event creation/edit, sent to Approved Athletes).
- [ ] Wire up the **Event Deletion** email (triggered by Admin action, sent to Approved Athletes).
**Runnable State:** 
- Actions taken in the application successfully and reliably dispatch real, styled emails to the correct recipients.

