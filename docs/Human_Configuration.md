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
   - **Authorized redirect URIs**: Add your Supabase project's redirect URI (e.g., `https://[YOUR_SUPABASE_PROJECT_ID].supabase.co/auth/v1/callback`).
   - Click Create.
5. Save the **Client ID** and **Client Secret**. You will need these for Supabase.

## 2. Vercel Deployment & Supabase Integration (Automated)
*Requirement: A Vercel account, a Supabase account, and a GitHub account.*

The simplest way to stand up the application is to use Vercel's native Supabase integration. This automatically creates your database and links all necessary environment variables, completely avoiding manual copy-pasting of API keys.

1. Click the **Deploy to Vercel** button on the project's GitHub repository.
2. During the setup flow, you will see a section for **Integrations**. Click **Add Integration** and select **Supabase**.
3. Follow the prompts to log into Supabase and either select an existing project or create a new one directly from the Vercel dashboard.
4. Vercel will automatically populate the required Supabase environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
   - > [!CAUTION]
   - > The `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security policies and grants full administrative access to the database. It **must never** be exposed on the client side (e.g., by prefixing it with `NEXT_PUBLIC_`).
5. You must manually provide the remaining Environment Variables:
   - `RESEND_API_KEY`: (From your Resend account, see Step 3)
   - `INITIAL_ADMIN_EMAIL`: The Google email address of the person who will be the first admin.
   - `NEXT_PUBLIC_APP_URL`: The production URL of the app (e.g., `https://my-club.vercel.app`).
6. Click **Deploy**.

## 3. Supabase Authentication Configuration
Now that your database is provisioned and linked, you must configure Google Login.

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard) and open your newly created project.
2. Under **Authentication > Providers**, enable **Google**.
   - Enter the **Client ID** and **Client Secret** obtained from Google Cloud (Step 1).
   - Copy the **Callback URL (for OAuth)** provided by Supabase.
3. Return to the **Google Cloud Console**.
   - Under **Credentials**, edit your OAuth client ID.
   - Add the copied Supabase Callback URL to the **Authorized redirect URIs**.
   - Add your newly created Vercel Domain (e.g., `https://my-club.vercel.app`) to the **Authorized JavaScript origins**.

## 4. Resend Configuration (Email)
*Requirement: A Resend account and ideally a custom domain.*
1. Go to [Resend](https://resend.com/) and create an account.
2. (Recommended) Add and verify your custom domain in Resend to ensure emails aren't marked as spam.
3. Generate an API Key and add it to your Vercel Environment Variables (`RESEND_API_KEY`).
4. Note the sender email address you intend to use in the application code.

## 5. Supabase Database Initialization
1. Navigate to the **SQL Editor** in your Supabase Dashboard.
2. Copy the contents of the `database/schema.sql` (or equivalent initialization script) from the project repository.
3. Run the SQL script. This will automatically:
   - Create the `Profiles`, `User_Roles`, `Games`, and `Attendance` tables.
   - Set up Row Level Security (RLS) policies.
   - Create the necessary database triggers (e.g., the trigger to automatically create a profile when a new user signs up).

## 6. Post-Deployment Verification
1. Navigate to your Vercel deployment URL.
2. Click "Login with Google" and authenticate using the exact email you set as `INITIAL_ADMIN_EMAIL`.
3. The system will recognize this email during its first login bootstrap and elevate your account to Admin.
4. Verify that you can access the User Management dashboard and add your first Game.
