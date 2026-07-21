# Highland Cal User Journeys

Based on the architecture and data schema, here are the primary user journeys for the application. The system follows a **"Public-First, High-Trust"** model, meaning the calendar is public to serve as a marketing tool for the club, while modifying the schedule or RSVPing requires an approved account. 

The journeys are broken down by the two main personas: **Athletes (End Users)** and **Admins (Site Operators)**.

---

## 1. End Users (Athletes & Public)

### Journey 1: Discovering Upcoming Games and Practices (Public Viewing)
**Goal:** Find out what Highland Games and club practices are on the schedule without needing to log in.
1. **Trigger:** A prospective athlete or club member wants to plan their season.
2. **Action:** They visit the main Highland Cal URL.
3. **System:** The system displays a chronologically sorted list of upcoming games and practices, showing the date, name, and location. This data is publicly accessible to act as a club marketing tool.
4. **Action:** They click the "Subscribe to Calendar" button to get a global iCal feed link.
5. **System:** The system provides a public `.ics` URL that the user can add to Google Calendar, Apple Calendar, or Outlook to sync all configured events.
6. **Action:** They visit an athlete's profile page (`/roster/[id]`, where `[id]` can be either their profile UUID or their selected vanity name).
7. **System:** The system resolves the profile (supporting both UUID and vanity name), and displays the athlete's details, schedule, and an athlete-specific "Subscribe to Schedule" iCal link (supporting `/api/calendar.ics?id=[uuid]` or `/api/calendar.ics?id=[vanity_name]`). Both URLs correctly fetch the athlete's dynamic calendar feed.

### Journey 2: Frictionless Onboarding & Pending Approval
**Goal:** Access the site, set up a profile, and request write-access to the club.
1. **Trigger:** An athlete wants to RSVP to a game or add a new practice.
2. **Action:** They click **"Login with Google"**.
3. **System:** The application authenticates the user via Google OAuth. A Postgres trigger automatically creates a new record in the `Profiles` and `User_Roles` tables. The user's role defaults to **"PENDING"**.
4. **System Action:** A Next.js Server Action uses Resend to send an email to the club Admin notifying them that a new user has registered and is pending approval.
5. **Completion:** The athlete lands on the dashboard but is shown a message that they cannot edit events or RSVP until an Admin approves their account.

### Journey 3: The High-Trust Event Management (Adding/Editing)
**Goal:** Expand or correct the club's schedule by adding/editing games or practices.
1. **Trigger:** An *approved* athlete discovers a game that isn't on the dashboard, or realizes a start time is wrong.
2. **Action:** They log in and navigate to "Add Event" or click "Edit" on an existing event.
3. **Action:** They provide/update the details: Name, Start Date, whether it is a two-day event, Location, and Registration URL. If editing, they can optionally check a box labeled "This is a major change—notify all athletes."
4. **System:** A Next.js Server Action receives the payload, inserts/updates the record in the `Games` table, and the event becomes instantly visible to everyone.
5. **System Action:** The *same* Server Action uses Resend to send an email to all approved athletes notifying them that a new event was added. If an event is edited, the Server Action *only* dispatches the email if the "major change" checkbox was selected on the frontend form.

### Journey 4: Registering & RSVPing for a Competition
**Goal:** Officially register for a game via external sites and let the club know.
1. **Trigger:** An *approved* athlete decides to compete in a specific game.
2. **Action:** They select the game on the dashboard and click the provided **Registration URL**.
3. **System:** The athlete is redirected to the independent registration site.
4. **Action:** After returning to the site, they update their RSVP `interest_level` to **`REGISTERED`**, **`INTERESTED`**, or **`NOT_GOING`**. If it is a two-day event and they are registered, they specify which day they are competing (Day 1, Day 2, or Both).
5. **System:** Row Level Security (RLS) ensures they can only edit their own attendance. Other logged-in users can view this status to coordinate travel via external channels (text/email). *(Note: No emails are triggered by RSVP changes).*

### Journey 5: Managing Personal Profile
**Goal:** Maintain a personal identity, select a custom profile URL (vanity name), and track individual schedules.
1. **Trigger:** An *approved* athlete wants to update their contact info, class, or customize their profile URL.
2. **Action:** They navigate to their "Profile" page.
3. **Action:** They update their competition `class` (e.g., A-Class, Masters, Women).
4. **Action:** They configure outward-facing links, explicitly adding their Instagram and Facebook profiles, and optionally providing up to 5 additional custom links (e.g., NASGA, HeavyAthlete).
5. **Action:** They select a unique vanity name to customize their profile URL.
6. **System:** The system checks that the user's role is `APPROVED` or `ADMIN` (users with `PENDING` roles cannot claim a vanity name). The vanity name input is auto-slugified (converted to lowercase, spaces replaced with hyphens) and validated using Zod to ensure it contains only lowercase ASCII alphanumeric characters and hyphens (`[a-z0-9-]`). The system checks that it is unique across all profiles, does not match any user's UUID, and does not match any reserved routing names blocklist (e.g., `admin`, `api`, `edit`, `new`, `settings`, `roster`, `calendar`, `dashboard`, `login`, `auth`, `public`, `feed`, `schedule`, `profile`, `logout`). The system then saves the profile including the `vanity_name`.
7. **System Warning:** If the user updates an existing vanity name, the UI displays a prominent warning: *"Changing your vanity name will break any profile links and iCal subscription feeds you have previously shared."*
8. **System:** Profiles are publicly viewable on the main roster page, and athletes have a dedicated public profile page (accessible via either `/roster/[uuid]` or `/roster/[vanity_name]`) that they can share with others, displaying their info and the events they are attending.

---

## 2. Admin Users (Site Operators)

### Journey 6: New Club Instance Deployment & Setup
**Goal:** Stand up a private instance of Highland Cal for a different club.
1. **Trigger:** An organizer from another Highland Games club discovers Highland Cal and wants to use it for their own team.
2. **Action:** The organizer clicks the **"Deploy to Vercel"** button on the project's GitHub repository (or follows the link in the README).
3. **Action:** During the Vercel setup flow, the organizer enters their own email address into the `INITIAL_ADMIN_EMAIL` environment variable.
4. **System:** Vercel provisions the hosting and handles the Supabase database integration.
5. **Action:** The organizer follows the steps in `Deployment.md` to link their Google Cloud Console OAuth credentials and Resend API key to their new instance.

### Journey 7: Managing User Access (Proactive Security)
**Goal:** Ensure only authorized club members can write to the database.
1. **Trigger:** The Admin receives an automated email via Resend that a new user has registered.
2. **Action:** The Admin navigates to the "User Management" section.
3. **Action:** They review the pending user and click "Approve".
4. **System:** A Next.js Server Action updates the user's role in the `User_Roles` table to "APPROVED".
5. **System Action:** The Server Action dispatches an email via Resend to the athlete letting them know their account has been approved and they can now RSVP and add events.

### Journey 8: Event Cleanup (Deleting Events)
**Goal:** Keep the calendar free of spam or cancelled events.
1. **Trigger:** A game is permanently cancelled, or an athlete accidentally created a duplicate event.
2. **Action:** The Admin views the event and clicks "Delete".
3. **System:** A Next.js Server Action removes the event from the database.
4. **System Action:** The Server Action sends an email via Resend to all approved users notifying them that the event has been deleted.

### Journey 9: Promoting a User to Admin
**Goal:** Delegate administrative responsibilities to another trusted club member.
1. **Trigger:** The current Admin wants to share the workload of managing the club.
2. **Action:** The Admin navigates to the "User Management" section.
3. **Action:** They locate an existing `APPROVED` user and click "Promote to Admin".
4. **System:** A Next.js Server Action updates the user's role in the `User_Roles` table to "ADMIN".
5. **System Action:** The Server Action dispatches an email via Resend to the user notifying them of their new administrative privileges.

### Journey 10: Configuring Site Content
**Goal:** Update the club's public-facing text.
1. **Trigger:** The club decides to change its name or update its mission statement on the home page.
2. **Action:** The Admin navigates to the "Admin Dashboard".
3. **Action:** They update the "Club Name" or "Home Page Blurb" in the Site Settings section and click "Save Settings".
4. **System:** A Next.js Server Action updates the `settings` table in the database and revalidates the cache for the home page.
5. **Result:** The new club name and blurb are immediately visible on the public landing page.

