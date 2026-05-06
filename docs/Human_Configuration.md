# Human Configuration Steps

This document outlines the manual steps a human (the Site Operator/Admin) must take to configure external services before the application can function. The goal is to provide these steps to a non-technical club organizer.

## 1. Google Cloud Console (OAuth 2.0 Setup)
*Requirement: A Google account to create the OAuth credentials.*
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project (e.g., "Highland Cal - [Club Name]").
3. Navigate to **APIs & Services > OAuth consent screen**.
   - Choose **External** and click Create.
   - Fill in the required App information (App name, User support email, Developer contact information).
   - Add the domain of your Vercel deployment to **Authorized domains** (once known).
   - Save and Continue. You do not need to add specific scopes beyond the default `email`, `profile`, and `openid`.
4. Navigate to **Credentials**.
   - Click **Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Name: "Highland Cal Web Auth".
   - **Authorized JavaScript origins**: Add your Vercel domain (e.g., `https://my-highland-cal.vercel.app`). Also add `http://localhost:3000` for local development.
   - **Authorized redirect URIs**: Add your Supabase project's redirect URI (e.g., `https://[YOUR_SUPABASE_PROJECT_ID].supabase.co/auth/v1/callback`). Also add `http://localhost:3000/auth/callback` for local development.
   - Click Create. 
5. Save the **Client ID** and **Client Secret**. You will need these for Supabase.

## 2. Supabase Configuration (Initial)
*Requirement: A Supabase account.*
1. Go to [Supabase](https://supabase.com/) and create a new project.
2. Under **Authentication > Providers**, enable **Google**.
   - Enter the **Client ID** and **Client Secret** obtained from Google Cloud.
   - Copy the **Callback URL (for OAuth)** provided by Supabase and add it to your Google Cloud OAuth "Authorized redirect URIs" (if not already done).
3. Retrieve the **Project URL**, **anon public API key**, and **service_role secret** from **Project Settings > API**.

## 3. Resend Configuration (Email)
*Requirement: A Resend account and ideally a custom domain.*
1. Go to [Resend](https://resend.com/) and create an account.
2. (Recommended) Add and verify your custom domain in Resend to ensure emails aren't marked as spam.
3. Generate an API Key.
4. Note the sender email address you intend to use (e.g., `notifications@yourclub.com`).

## 4. Vercel Deployment & Environment Variables
*Requirement: A Vercel account and GitHub account.*
1. Generate a random secure string to use as your `WEBHOOK_SECRET` (e.g., using a password generator).
2. Click the **Deploy to Vercel** button on the project repository.
3. During the setup flow, Vercel will prompt for Environment Variables. You must provide:
   - `NEXT_PUBLIC_SUPABASE_URL`: (From Supabase)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (From Supabase)
   - `SUPABASE_SERVICE_ROLE_KEY`: (From Supabase - needed for admin server actions)
   - `RESEND_API_KEY`: (From Resend)
   - `INITIAL_ADMIN_EMAIL`: The Google email address of the person who will be the first admin.
   - `NEXT_PUBLIC_APP_URL`: The production URL of the app (e.g., `https://my-club.vercel.app`).
   - `WEBHOOK_SECRET`: The random string you generated in Step 1.
4. Deploy the project.

## 5. Supabase Database Initialization
1. Now that your Vercel app is deployed and you know your `NEXT_PUBLIC_APP_URL`, return to the Supabase SQL Editor.
2. Open the SQL initialization scripts for the project. Replace any placeholder values for your Vercel App URL and Webhook Secret in the Database Webhook definitions.
3. Run the SQL initialization scripts to create tables, RLS policies, and triggers.

## 6. Post-Deployment Verification
1. Navigate to your Vercel deployment URL.
2. Click "Login with Google" and authenticate using the email you set as `INITIAL_ADMIN_EMAIL`.
3. Verify that your profile is automatically set to "Admin" and you can access the User Management dashboard.
