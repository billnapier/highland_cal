# Highland Cal 🐮📅

Welcome to **Highland Cal**! 🎉

*Wait, did you say Highland **Cow**? 🐄 Nope, it's Highland **Cal** (short for Calendar)!
Though to be fair, they both love a good grassy field and are absolute units of Scottish awesomeness. 🏴󠁧󠁢󠁳󠁣󠁴󠁿*

Highland Cal (project code name **CaberTrack**) is a web application specifically designed to coordinate attendance, registrations, and interest levels for Highland Games athletes. **Throwing heavy things in kilts has never been so flawlessly organized! 🪵💪**

---

## 🚀 MVP Launch Announcement!

We are absolutely thrilled to announce the **MVP Launch of Highland Cal**! After rigorous development, our first production-ready release is officially live. 

Highland Cal was built with a **"Public-First, High-Trust"** model:
1. **Public-First**: The calendar of events, practice schedules, and athlete rosters are fully public to serve as an excellent marketing and recruitment tool for your club.
2. **High-Trust**: Modification of the calendar, RSVPing, and managing settings is securely gated behind Google Federated Authentication, allowing approved members of your club to easily coordinate schedules without administrative bottlenecks.

---

## ✨ Key Features (MVP)

Here is a look at what Highland Cal delivers out-of-the-box:

### 🏃‍♂️ For Athletes & the Public
* **Dynamic Event Discovery**: A beautiful, chronologically sorted public schedule of all upcoming games, clinics, and practices.
* **Subscribe to Calendar (iCal Feed)**: Seamless integration with Google Calendar, Apple Calendar, and Outlook. One click lets athletes subscribe to a public `.ics` feed that syncs automatically.
* **Frictionless Google Login**: A strict **Zero Password Policy**. Safe, modern authentication using Google OAuth.
* **Smart RSVP & Attendance Tracking**: Athletes can RSVP to events with their interest level (`REGISTERED`, `INTERESTED`, `WATCHING`, or `NOT_GOING`). If it's a multi-day festival, they can specify exactly which days they are competing (Day 1, Day 2, or Both).
* **Public Roster & Athlete Profiles**: Every athlete gets a dedicated, shareable profile page (e.g., `/roster/athlete-id`) displaying their competition class (e.g., A-Class, Masters, Women), contact info, social links (Instagram/Facebook), up to 5 custom links (like NASGA or HeavyAthlete), and a personalized avatar photo.

### 👑 For Admins & Site Operators
* **Zero-Code Onboarding**: The first time the designated Admin logs in with Google, their account is automatically elevated with administrative privileges.
* **User Management Dashboard**: Gate write-access easily. Admins receive email alerts when new users register, can approve pending members with a click, and can promote trusted users to Admins or remove users.
* **Dynamic Site Customization**: Easily update the club's name, custom home page blurb, and upload a beautiful **Landing Page Hero Image** directly from the admin panel.
* **Event Moderation**: Create, edit, and safely delete events. When creating or updating events, a "major change" checkbox option allows admins and approved members to trigger instant email notifications to the entire club.
* **Automated Transactional Emails**: Powered by **Resend**, the app automatically dispatches real-time, beautifully designed HTML emails for:
  - New user registrations (sent to Admins)
  - Account approvals (sent to Athletes)
  - New events / major schedule changes (sent to all Approved Athletes)
  - Event deletions (sent to all Approved Athletes)

---

## ⚡ Want Your Own Club's Version? (Deploy in 5 Minutes!)

We designed Highland Cal as a **decentralized self-service application**. Any Highland Games club or athletic team in the world can copy our code and deploy their own independent, private instance in less than five minutes—**no coding knowledge or terminal commands required!**

### 💰 Cost Breakdown (Per Club)
Your instance runs entirely on free tier allocations, meaning **keeping it online costs exactly $0.00/month**:

| Service | Provider & Tier | Monthly Cost |
| :--- | :--- | :--- |
| **Hosting & CI/CD** | Vercel (Hobby Plan) | `$0.00` |
| **Database & Auth** | Supabase (Free Tier) | `$0.00` |
| **Identity / Google Login** | Google Cloud Platform Identity | `$0.00` |
| **Transactional Emails** | Resend (Free Tier - 3,000 emails/mo) | `$0.00` |
| **Total Cost** | | **`$0.00 / month`** |

### 🚀 1-Click Vercel Deployment

Get started immediately by clicking the button below:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbillnapier%2Fhighland_cal&env=NEXT_PUBLIC_APP_NAME,INITIAL_ADMIN_EMAIL&envDescription=Provide%20your%20Club%20Name%20and%20the%20Google%20email%20address%20for%20the%20first%20Admin%20account.)

> [!IMPORTANT]
> When prompted by Vercel:
> 1. Set `NEXT_PUBLIC_APP_NAME` to your club's name (e.g., `Denver Thistle`).
> 2. Set `INITIAL_ADMIN_EMAIL` to your own Google email address (e.g., `organizer@gmail.com`). This grants you full Admin access on your very first login!
> 3. Make sure to choose the **Supabase Integration** option during the setup.

For the easy step-by-step setup of your database, Google OAuth credentials, and email system, follow our comprehensive [Clubs Deployment Guide](./docs/Deployment.md).

---

## 🔄 Frictionless Updates

Worried about your site becoming outdated? As we release new features, upgrading your site is incredibly simple:
1. Go to your cloned repository on GitHub.
2. Click **"Sync fork"** > **"Update branch"**.
3. Vercel will automatically rebuild and deploy the new version of your site in the background.
4. Supabase will automatically detect and apply any new database schema migrations safely. You never have to touch SQL!

---

## 💻 Local Development

If you want to contribute to the core codebase, follow these steps to set up the app locally:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/billnapier/highland_cal.git
   cd highland_cal
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env.local` and populate it with your local Supabase credentials and GCP keys:
   ```bash
   cp .env.example .env.local
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   # or
   bun dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see your local instance.

---

## 🛡️ Technical Architecture

For detailed discussions about our system design, schemas, and security model, please refer to our internal documentation:
* [Architecture Specification](./docs/Architecture.md)
* [Detailed System Design](./docs/Detailed_Design.md)
* [Visual Design Guidelines](./docs/Visual_Design.md)
* [Implementation Roadmap](./docs/Roadmap.md)

---

Developed with 🪵, 🏴󠁧󠁢󠁳󠁣󠁴󠁿, and passion for the Highland Games. Let's throw some cabers! 🚀

