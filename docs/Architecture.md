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
| **Infrastructure** | Vercel Buttons / Terraform | Automated provisioning for diverse technical backgrounds. |
| **Email** | Resend | Transactional emails for notifications (e.g., pending user approvals). Fits well within free tier. |

---

## 3. Data Schema (PostgreSQL)
The system uses a relational model to track the many-to-many relationship between athletes and games.

### 3.1. Profiles Table
- **id** (uuid, primary key): Linked to the unique identifier provided by Google via Supabase Auth.
- **display_name** (text): Athlete's name (pre-populated from Google profile).
- **class** (text): Competition class (e.g., A-Class, Masters, Women).

### 3.2. Games Table
- **id** (uuid, primary key)
- **name** (text): Name of the Highland Games.
- **date** (date): Date of competition.
- **location** (text): City/State.
- **registration_url** (text): Link to the independent registration site.

### 3.3. Attendance Table
- **id** (uuid, primary key)
- **user_id** (uuid, foreign key)
- **game_id** (uuid, foreign key)
- **interest_level** (enum): `[Watching, Interested, Registered, Not Going]`

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
- **RLS Gatekeeper:** Write operations (RSVPing, adding events) require the user to be authenticated and have an "Approved" status set by an Admin.
- **High-Trust Writes:** Any approved member can add or edit games/practices. Admins retain the ability to delete events. RLS policies verify `auth.uid()` against records where users modify their own attendance.
- **Admin Role:** The initial Admin user is explicitly defined during the instance deployment (e.g., via an environment variable). The Admin is responsible for approving new users.

---

## 5. Deployment & DevOps Strategy

### 5.1. The "Golden Rule" of Deployment: Functional Vercel Button
The **highest priority requirement** for this project is that the "Deploy to Vercel" button remains functional at all times. The setup process for Google OAuth must be documented and streamlined within this flow to ensure non-technical users can successfully link their Google Cloud Console credentials to their specific instance.

### 5.2. Decentralized Self-Hosting
Each club maintains its own Vercel and Supabase accounts. This ensures that each club manages its own Google OAuth client IDs, keeping club data logically and physically isolated.

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
- **Cross-Club Coordination:** Optional opt-in to share "public" interest levels with other clubs while maintaining private carpool notes.
- **Automated Game Scrapers:** Serverless functions to automatically update the `Games` table from known independent league schedules.
