# CaberTrack (Highland Cal) User Journeys

Based on the architecture and data schema, here are the primary user journeys for the application. The journeys are broken down by the two main implied personas: **Athletes** and **Club Organizers**.

---

## 1. End Users (Athletes)

### Journey 1: Frictionless Onboarding
**Goal:** Access the site and set up a profile with zero hassle.
1. **Trigger:** The end user receives a link to their club's site.
2. **Action:** They navigate to the app and click **"Login with Google"**.
3. **System:** The application redirects to Google OAuth, authenticates the user, and securely handles the callback via Supabase Auth.
4. **Action:** A record is automatically created in the `Profiles` table using the Google `display_name`.
5. **Completion:** The end user lands on the dashboard and is prompted to optionally set their competition `class` (e.g., A-Class, Masters, Women).

### Journey 2: Discovering Upcoming Games and Practices
**Goal:** Find out what Highland Games and club practices are on the schedule.
1. **Trigger:** The end user wants to plan their season or upcoming week.
2. **Action:** They view the main dashboard calendar.
3. **System:** The system queries the events and displays a chronologically sorted list of upcoming games and practices (with a clear visual distinction between the two), showing the date, name, and location.
4. **Action:** They click the "Subscribe to Calendar" button to get a global iCal feed link.
5. **System:** The system provides an `.ics` URL that the user can add to Google Calendar, Apple Calendar, or Outlook to sync all configured events.

### Journey 3: Adding a New Game
**Goal:** Expand the club's schedule by adding games of interest.
1. **Trigger:** The end user discovers a game they want to attend that isn't on the dashboard.
2. **Action:** They navigate to an "Add Game" section.
3. **Action:** They provide the game details: Name, Date, Location, and Registration URL.
4. **System:** A new record is inserted into the `Games` table and immediately becomes visible to all authenticated users.

### Journey 4: Registering for a Competition
**Goal:** Officially register for a game via external sites.
1. **Trigger:** The end user decides to compete in a specific game.
2. **Action:** They select the game on the dashboard and click the provided **Registration URL**.
3. **System:** The end user is redirected to the independent registration site.
4. **Completion:** After completing external registration, they return to the site and update their status.

### Journey 5: Coordinating Attendance, Carpooling, and Lodging
**Goal:** Let the club know their intent and coordinate logistics.
1. **Trigger:** The end user wants to see who else is going to an upcoming game or practice and arrange travel.
2. **Action:** They select the game or practice and view the current attendance list from their club.
3. **Action:** They update their own `interest_level` to **"I'm going"**, **"I'm interested"**, **"Not going"**, or **"Not sure"**.
4. **Action:** They add `notes` (e.g., *"Driving from Portland, have 2 open seats in the truck"* or *"Looking to split an Airbnb"*).
5. **System:** The application upserts the `Attendance` record. Row Level Security (RLS) ensures they can only edit their own attendance.

### Journey 6: Managing Personal Profile
**Goal:** Maintain a personal identity and track individual schedules.
1. **Trigger:** The end user wants to view their upcoming events or update their contact info.
2. **Action:** They navigate to their "Profile" page.
3. **Action:** They view a personalized summary of their specific reservation statuses (games and practices they are attending).
4. **Action:** They configure outward-facing links, adding their social media profiles (Instagram, Facebook) and links to external Highland Games athlete profiles (NASGA, HeavyAthlete).
5. **Action:** They copy their personal iCal feed link from their profile.
6. **System:** The system saves the extended profile data, and provides a dynamic `.ics` URL filtered specifically to only include events where the user's status is "I'm going" or "I'm interested".

---

## 2. Admin Users (Site Operators)

*(Note: The current schema doesn't explicitly define an 'Admin' boolean or role yet. Admin users are the ones who deploy and manage the system.)*

### Journey 7: Instance Deployment & Setup
**Goal:** Stand up a private instance for the club.
1. **Trigger:** A club organizer wants to use CaberTrack for their club.
2. **Action:** The organizer clicks the **"Deploy to Vercel"** button on the project's GitHub repository.
3. **System:** Vercel provisions the hosting, and Terraform (or similar automation) spins up the Supabase database.
4. **Action:** The organizer follows documented steps to link their Google Cloud Console OAuth credentials to their instance, completing the zero-password setup.

### Journey 8: Configuring Site Identity
**Goal:** Customize the instance to match the club's branding.
1. **Trigger:** The admin wants to personalize the newly deployed site.
2. **Action:** They navigate to the "Site Settings" area.
3. **Action:** They update the "Site Name" (e.g., "Seattle Highland Games Club") and upload a custom logo or hero image.
4. **System:** The application saves these global configuration settings (likely to a `SiteSettings` table or environment variables) and updates the UI for all end users.

### Journey 9: Managing User Access
**Goal:** Ensure only authorized club members can access the private instance.
1. **Trigger:** An unknown user registers, or a member leaves the club.
2. **Action:** The admin navigates to the "User Management" section.
3. **Action:** They review the list of registered users. They can toggle an "Approved" status or click "Revoke Access" for specific individuals.
4. **System:** The application updates the user's role/status in the `Profiles` table. RLS policies instantly prevent revoked users from reading games or attendance data.

### Journey 10: Scheduling Practices
**Goal:** Add club practices to the calendar.
1. **Trigger:** The admin finalizes the time and location for a club practice.
2. **Action:** The admin navigates to the "Add Event" section and selects "Practice".
3. **Action:** They provide the practice details: Name (e.g., "Saturday Throwing Session"), Date, Location, and any relevant links.
4. **System:** A new practice record is inserted and immediately becomes visible to all authenticated users with a clear distinction from official games.
