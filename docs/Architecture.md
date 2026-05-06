# Highland Games Club Tracker - ccccccc Specification V4

**Project Code Name:** CaberTrack  
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
- **notes** (text): Carpooling or lodging notes.

---

## 4. Security & Identity

### 4.1. Authentication (Identity)
To eliminate the security overhead and user friction of local credential management, the application enforces the following:
- **Exclusive Federated Identity:** All authentication is handled via Google Federated Authentication.
- **Zero Password Policy:** The application does not collect, store, or manage passwords or usernames.
- **Onboarding:** Upon first login via Google, a record is automatically created in the `Profiles` table using the identity information returned by the provider.

### 4.2. Authorization (Permissions)
While identity is handled externally, **Authorization is managed internally via Row Level Security (RLS).**
- **RLS Gatekeeper:** The database continues to be the authoritative source of truth for permissions. RLS policies verify that `auth.uid()` (the Google-provided ID) matches the `user_id` of the record being accessed or modified.
- **ACL Enforcement:** All read/write operations must pass RLS constraints. This ensures that an authenticated user can only modify their own attendance records.

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
| **Total** | | **$0.00** |

---

## 7. Future Extensibility
- **Cross-Club Coordination:** Optional opt-in to share "public" interest levels with other clubs while maintaining private carpool notes.
- **Automated Game Scrapers:** Serverless functions to automatically update the `Games` table from known independent league schedules.
