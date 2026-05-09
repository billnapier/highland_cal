# Human Configuration Steps

This document outlines the manual steps a human (the Site Operator/Admin) must take to configure external services before the application can function securely. The goal is to provide these steps to a non-technical club organizer.

## 1. Google Cloud Console (OAuth 2.0 Setup)
*Requirement: A Google account to create the OAuth credentials.*
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project (e.g., "Highland Cal - [Club Name]").
3. Navigate to **APIs & Services > OAuth consent screen**.
   - Choose **External** and click Create.
   - Fill in the required App information (App name, User support email, Developer contact information).
   - Add the domain of your Vercel deployment to **Authorized domains** (once known, see Step 7).
   - Save and Continue through the Scopes and Test Users screens (defaults are fine).
4. Navigate to **Credentials**.
   - Click **Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Name: "Highland Cal Web Auth".
   - **Authorized JavaScript origins**: Add `http://localhost:3000` for local development. (You will add your Vercel URL here later).
   - **Authorized redirect URIs**: Leave blank for now (we get these from Supabase in Step 3).
   - Click Create.
5. Save the **Client ID** and **Client Secret**. You will need these for Supabase.

## 2. Supabase Setup (Production & Staging)
*Requirement: A Supabase account. We create two databases to keep your real data safe while testing new features.*
1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. **Create the Production Database:** Click "New Project" and name it `Highland Cal - PROD`. Wait for it to provision.
3. **Create the Staging Database:** Go back to the dashboard, click "New Project", and name it `Highland Cal - STAGING`. Wait for it to provision.
4. **Run the Schema (Do this on BOTH projects):**
   - On the left sidebar, click on the **SQL Editor**.
   - Open the `database/schema.sql` file from your local codebase, copy all of the text, and paste it into the Supabase SQL editor.
   - Click **Run**. You should see a "Success" message.

## 3. Supabase Authentication Configuration
1. **Enable Google Login (Do this on BOTH projects):**
   - In your Supabase project, navigate to **Authentication** (the two people icon).
   - *Note: If the menu changes, use `Cmd+K` (Mac) or `Ctrl+K` (Windows) to search for "Providers".*
   - In the secondary menu, under **Configuration**, click **Providers**.
   - Find **Google**, enable it, and paste in the **Client ID** and **Client Secret** obtained from Google Cloud.
   - Click **Save**.
   - Copy the **Callback URL (for OAuth)** (e.g., `https://[project-id].supabase.co/auth/v1/callback`).
2. **Update Google Cloud:**
   - Return to the **Google Cloud Console > Credentials**.
   - Edit your OAuth client ID.
   - Add the copied Supabase Callback URLs for **BOTH** your PROD and STAGING projects to the **Authorized redirect URIs**.
   - Click Save.

## 4. Vercel Deployment & Environment Variables
*Requirement: A Vercel account linked to your GitHub account.*
1. Log into [Vercel](https://vercel.com/) and click **Add New > Project**. Import your `highland_cal` GitHub repository.
2. Open the **Environment Variables** section before deploying.
3. **How to find your Supabase URL:**
   - Go to your Supabase dashboard. Look at your browser's address bar. It will look like `https://supabase.com/dashboard/project/abcdefghijklmnopqr`.
   - Your `NEXT_PUBLIC_SUPABASE_URL` is simply `https://abcdefghijklmnopqr.supabase.co`.
   - Your keys are found under **Project Settings (Gear Icon) > API**.
4. **Map the Variables:**
   - **Production (Check "Production" ONLY):**
     - `NEXT_PUBLIC_SUPABASE_URL`: (Your PROD URL)
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (Your PROD `anon` `public` key)
     - `SUPABASE_SERVICE_ROLE_KEY`: (Your PROD `service_role` `secret` key)
   - **Staging (Check "Preview" and "Development" ONLY):**
     - `NEXT_PUBLIC_SUPABASE_URL`: (Your STAGING URL)
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (Your STAGING `anon` `public` key)
     - `SUPABASE_SERVICE_ROLE_KEY`: (Your STAGING `service_role` `secret` key)
   - **Global (Check ALL environments):**
     - `INITIAL_ADMIN_EMAIL`: The Google email address of the first admin.
     - `RESEND_API_KEY`: Leave blank or placeholder if not set up yet.
     - `NEXT_PUBLIC_APP_URL`: The production URL of the app (once known).
5. Click **Deploy**.

## 5. Resend Configuration (Email Setup)
1. Go to [Resend](https://resend.com/) and create an account.
2. Generate an API Key: Click on **API Keys**, click **Create API Key**, give it "Full access", and copy the `re_...` key.
3. Add the key to Vercel: Go to your Vercel project > Settings > Environment Variables, and add `RESEND_API_KEY` with the copied key (select all environments).

## 6. Post-Deployment Verification
1. Once Vercel finishes deploying, note your live production URL (e.g., `https://highland-cal.vercel.app`).
2. Go back to the **Google Cloud Console > Credentials** screen and add that exact Vercel URL to the **Authorized JavaScript origins**.
3. Go back to your **Supabase PROD Project > Authentication > URL Configuration**:
   - Set the **Site URL** to your new Vercel URL.
   - Under **Redirect URLs**, add `https://your-vercel-url.vercel.app/auth/callback` (or simply `https://*` if you want to support Vercel preview branches). *If you miss this step, Supabase will redirect successful logins to `localhost`!*
4. Navigate to your Vercel URL. Click "Login with Google" and authenticate using the exact email you set as `INITIAL_ADMIN_EMAIL`.
5. The system will elevate your account to Admin.

## 7. Custom Domain Setup & Verification (Milestone 11)
To make your site look professional and ensure your emails aren't marked as spam, you need a custom domain (e.g., `myclub.com`).
1. **Link Domain to Vercel:**
   - In Vercel, go to **Settings > Domains**.
   - Add your custom domain. Vercel will provide DNS records (A and CNAME records).
   - Log into your domain registrar (GoDaddy, Namecheap, etc.) and add these records.
   - Once verified in Vercel, update your `NEXT_PUBLIC_APP_URL` environment variable to match the new domain.
2. **Verify Domain in Resend (Crucial for Emails):**
   - By default, Resend only lets you send test emails to yourself.
   - In Resend, go to **Domains** and click **Add Domain**.
   - Enter your custom domain.
   - Resend will provide TXT and MX records. Add these to your domain registrar's DNS settings.
   - Once verified, note the email address you want to send *from* (e.g., `notifications@myclub.com`), as this will be required in the application code.
