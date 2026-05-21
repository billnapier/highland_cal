# Highland Cal - Specification V4

**Project Name:** Highland Cal  
**Target Audience:** Highland Games Throwing Clubs  
**Deployment Model:** Decentralized Open-Source / Self-Hosted  

---

## 1. Executive Summary
This document outlines the architecture for a web application designed to coordinate attendance and interest levels for Highland Games athletes. The system follows a decentralized model where individual clubs deploy their own isolated instances. This version prioritizes identity management through external federation and database-level authorization logic.

---

## 2. Tech Stack Overview

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | Next.js (React) | Framework for UI and Serverless API routes. |
| **Hosting** | Vercel | Global Edge Network for hosting and CI/CD. |
| **Database** | Supabase (PostgreSQL) | Relational data storage with integrated Row Level Security (RLS). |
| **Authentication** | Federated Google Auth | Identity management via Google OAuth 2.0. No local credentials stored. |
| **Infrastructure** | Vercel | Automated provisioning for diverse technical backgrounds. |
| **Email** | Resend | Transactional emails for notifications (e.g., pending user approvals). Fits well within free tier. |

---

## 3. Data Schema (PostgreSQL)
The system uses a relational model to track the many-to-many relationship between athletes and games.

### 3.1. Profiles & Roles Tables
To separate public user data from secure authorization data, the system uses two tables:
- **Profiles**:
  - **id** (uuid, primary key): Linked to `auth.users` via a Postgres trigger on sign-up.
  - **display_name** (text): Athlete's name.
  - **class** (text): Competition class (e.g., A-Class, Masters, Women).
- **User_Roles**:
  - **user_id** (uuid, primary key): Linked to `Profiles`.
  - **role** (enum): `[PENDING, APPROVED, ADMIN]`. Kept in a separate table so standard RLS policies can prevent users from updating their own roles.

### 3.2. Games Table
- **id** (uuid, primary key)
- **name** (text): Name of the Highland Games.
- **start_timestamp** (timestamptz): Start date and time of the competition.
- **end_timestamp** (timestamptz): End date and time of the competition.
- **local_timezone** (text): The timezone string (e.g., 'America/Los_Angeles') for display purposes.
- **location** (text): City/State.
- **registration_url** (text): Link to the independent registration site.

### 3.3. Attendance Table
- **id** (uuid, primary key)
- **user_id** (uuid, foreign key)
- **game_id** (uuid, foreign key)
- **interest_level** (enum): `['WATCHING', 'INTERESTED', 'REGISTERED', 'NOT_GOING']`

---

## 4. Security & Identity

### 4.1. Authentication (Identity)
To eliminate the security overhead and user friction of local credential management, the application enforces the following:
- **Exclusive Federated Identity:** All authentication is handled via Google Federated Authentication.
- **Zero Password Policy:** The application does not collect, store, or manage passwords or usernames.
- **Onboarding:** Upon first login via Google, a record is automatically created in the `Profiles` table using the identity information returned by the provider.

### 4.2. Authorization (Permissions)
While identity is handled externally, **Authorization is managed internally via Row Level Security (RLS) and Application Logic.**
- **Public Reads:** The calendar, practice schedule, and profiles are public. Unauthenticated users can view this data, allowing the application to serve as a marketing/recruiting tool for the club.
- **RLS Gatekeeper:** Write operations (RSVPing, adding events) require the user to be authenticated and have an "APPROVED" or "ADMIN" role in the `User_Roles` table.
- **High-Trust Writes:** Any approved member can add or edit games/practices. Admins retain the ability to delete events. RLS policies verify `auth.uid()` against records where users modify their own attendance.
- **Admin Role:** The initial Admin user is explicitly defined during the instance deployment (e.g., via an environment variable). The Next.js application bootstraps this admin on their first login.

### 4.3 Notifications (Next.js Server Actions)
The application relies strictly on **Next.js Server Actions** to perform database mutations and dispatch transactional emails (via Resend). 
While database webhooks might seem appealing, they lack the context of frontend state (e.g., an athlete checking an optional "This is a major change" box) and cannot dynamically route to Vercel Preview Deployment URLs. Server Actions solve both problems by executing the mutation, checking the UI state, and sending the email all within the correct environment context.

---

## 5. Deployment & DevOps Strategy

### 5.1. The "Golden Rule" of Deployment: Functional Vercel Button
The **highest priority requirement** for this project is that the "Deploy to Vercel" button remains functional at all times. The setup process leverages the Vercel Native Supabase Integration, ensuring non-technical users can provision the app and database without manually copying API keys.

### 5.2. Decentralized Self-Hosting
Each club maintains its own Vercel and Supabase accounts. This ensures that each club manages its own Google OAuth client IDs, keeping club data logically and physically isolated.

### 5.3. CI/CD & Preview Environments
- **Continuous Integration (CI):** GitHub Actions must be configured to run linting, type-checking, and automated tests on every Pull Request.
- **Continuous Deployment (CD):** Merges to the `main` branch are automatically deployed to production via Vercel's native GitHub integration.
- **Preview Deployments (PR Testing):** Vercel automatically generates ephemeral environments for every PR. To make these work with Google OAuth without tedious manual configuration, Supabase handles the OAuth flow (Google only needs the Supabase callback URL). Supabase is then configured to allow wildcard redirect URIs (e.g., `https://*-clubname.vercel.app/**`) so it can redirect back to any dynamic Vercel PR URL.

### 5.4. Database Initialization & Migrations (Supabase GitHub Integration)
To maintain the "zero-code" deployment philosophy, this project explicitly avoids requiring users to copy and paste raw SQL. 
- **Initialization:** We utilize the **Supabase GitHub Integration**. When a club forks this repository and links it to their Supabase project, Supabase automatically detects the `supabase/migrations/` directory and executes the initial schema.
- **Future Milestones (Upgrades):** Any future changes to the database schema MUST be written as a new timestamped migration file in `supabase/migrations/` (e.g., `20260601000000_new_feature.sql`). This ensures that when other clubs click "Sync Fork" in GitHub to update their application, their Supabase database automatically applies the new migrations without human intervention.

---

## 6. Cost Analysis (Per Club)

| Service | Tier | Monthly Cost |
| :--- | :--- | :--- |
| Vercel | Hobby Plan | $0.00 |
| Supabase | Free Tier | $0.00 |
| Google Auth | GCP Identity Platform | $0.00 (Standard Tier) |
| Resend | Free Tier | $0.00 (Up to 3,000 emails/month) |
| **Total** | | **$0.00** |

---

## 7. Future Extensibility
- **Cross-Club Coordination:** Optional opt-in to share "public" interest levels with other clubs.
- **Automated Game Scrapers:** Serverless functions to automatically update the `Games` table from known independent league schedules.
