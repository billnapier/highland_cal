# Deployment Guide for Other Clubs

Welcome! Highland Cal is designed so that any Highland Games club or athletic team can launch their own version of this app in minutes without needing to understand code or the command line.

This guide walks you through deploying your own instance using free-tier services. 

---

## Step 1: The One-Click Deploy

We use Vercel to host the application. Vercel provides a magical "Deploy" button that clones our code into your own account and sets up the server automatically.

1. **Click the Deploy Button** located in our main [README.md](../README.md).
2. **Connect to GitHub:** Vercel will ask you to log in with GitHub. It will then fork (copy) the Highland Cal repository to your own GitHub account.
3. **Configure Environment Variables:** Vercel will prompt you for two pieces of information:
   - `NEXT_PUBLIC_APP_NAME`: Your club's name (e.g., "Denver Thistle").
   - `INITIAL_ADMIN_EMAIL`: Your personal Google email address (e.g., `you@gmail.com`). *This exact email will be granted Admin powers upon first login.*
4. **Add the Supabase Integration:** 
   - During the checkout flow, Vercel will allow you to add **Supabase**. Click this to add the integration.
   - It will prompt you to create a new Supabase account/project. 
   - *Why do this?* Supabase is our database. By adding the integration here, Vercel will automatically configure the database connection passwords and URLs for you!
5. **Click Deploy** and wait for Vercel to finish building your site. Your site is now live on the internet, but the database is empty and logins won't work yet.

---

## Step 2: Initialize Your Database (Automated)

Your app is deployed, but the database doesn't have the tables (Games, Profiles, Attendance) it needs to function. We will use Supabase's GitHub integration to build your database automatically.

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select the project you just created via Vercel.
3. Navigate to **Project Settings** (the gear icon) > **Integrations**.
4. Find the **GitHub** integration and click **Install** or **Connect**.
5. Follow the prompts to authorize Supabase and select your newly forked `highland_cal` repository.
6. **That's it.** Supabase will automatically scan the repository, find our setup file in `supabase/migrations/`, and initialize your database tables instantly. You never have to touch SQL!
   *(Bonus: If we release new features later, you just click "Sync Fork" in GitHub, and Supabase will automatically upgrade your database to match).*

---

## Step 3: Enable Google Login

Highland Cal uses Google to securely log people in without requiring them to remember passwords.

### A. Create Google Credentials
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project (e.g., "Highland Cal - [Club Name]").
3. Navigate to **APIs & Services > OAuth consent screen**.
   - Choose **External** and click Create.
   - Fill in the required App info.
   - Save and Continue through the Scopes and Test Users screens (defaults are fine).
4. Navigate to **Credentials > Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Name: "Highland Cal Web Auth".
   - **Authorized JavaScript origins**: Paste your exact live Vercel URL (e.g., `https://your-club.vercel.app`).
   - **Authorized redirect URIs**: We will add this in the next step.
   - Click Create. Save the **Client ID** and **Client Secret**.

### B. Add to Supabase
1. Return to your [Supabase Dashboard](https://supabase.com/dashboard) and go to **Authentication** > **Providers**.
2. Find **Google**, enable it, and paste in the **Client ID** and **Client Secret** you just got from Google Cloud.
3. Click **Save**.
4. Copy the **Callback URL (for OAuth)** provided on that screen (e.g., `https://[project-id].supabase.co/auth/v1/callback`).

### C. Finish Google Setup
1. Go back to your Google Cloud Console's OAuth client you just created.
2. Under **Authorized redirect URIs**, paste the Supabase Callback URL you copied. 
3. Click Save.

---

## Step 4: Finalizing the App

Almost done! We just need to tell Supabase where your app lives so it knows where to send users after they log in.

1. **Configure Supabase Redirects:**
   - In Supabase, go to **Authentication > URL Configuration**.
   - Set the **Site URL** to your exact Vercel URL (e.g., `https://your-club.vercel.app`).
   - Under **Redirect URLs**, add `https://your-club.vercel.app/auth/callback`. *(If you skip this, users will be redirected into the void after logging in!)*
2. **Log In:**
   - Go to your live Vercel URL.
   - Click "Login with Google".
   - **CRITICAL:** Make sure you use the exact Google Account email that you set as the `INITIAL_ADMIN_EMAIL` back in Step 1.
3. Welcome to your new Admin Dashboard! The app will automatically detect you are the first user and elevate your account.

---

## Step 5: Updating Your Site (Future Releases)

As Highland Cal improves, you will want to get the latest features and bug fixes. Because of the automation we set up, updating is incredibly easy.

1. Log into GitHub and go to your forked `highland_cal` repository.
2. Near the top of the code section, look for a button that says **"Sync fork"**.
3. Click it, and then click **"Update branch"**.
4. **That's it.** 
   - Vercel will automatically detect the update, build the new code, and deploy it to your live site within a few minutes.
   - Supabase will automatically detect any new database changes and safely apply them. 

---

## Optional: Custom Domain & Email Notifications

If you want your site to live at a professional domain (e.g., `myclub.com`) and send real email notifications (RSVPs, Event Updates), follow these steps:

1. **Custom Domain on Vercel:** In Vercel, go to Settings > Domains. Add your domain and follow the instructions to update your DNS records (A and CNAME) at your domain registrar.
2. **Update Supabase URL Configuration (CRITICAL for Custom Domain):**
   When using a custom domain, you must tell Supabase where to redirect users after they log in, otherwise it will fall back to your old `.vercel.app` URL.
   - Go to your [Supabase Dashboard](https://supabase.com/dashboard) > **Authentication** > **URL Configuration**.
   - Change the **Site URL** from your `.vercel.app` address to your new custom domain (e.g., `https://myclub.com`).
   - In the **Redirect URLs** list, add your custom callback URL: `https://myclub.com/auth/callback` (or use the wildcard: `https://myclub.com/**`).
   - Click **Save**.
3. **Update Google OAuth Client Credentials:**
   Google also needs to know about your custom domain.
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Go to **APIs & Services > Credentials** and edit your Web application OAuth client ID.
   - Under **Authorized JavaScript origins**, add your new custom domain (e.g., `https://myclub.com`).
   - Leave the **Authorized redirect URIs** pointing to your Supabase callback (e.g., `https://[project-id].supabase.co/auth/v1/callback`).
   - Click **Save**.
4. **Email Setup:** 
   - Create an account at [Resend](https://resend.com).
   - Verify your custom domain in Resend by adding their TXT/MX records to your DNS settings.
   - Generate a Resend API Key.
   - In Vercel, go to Settings > Environment Variables, and add `RESEND_API_KEY` with your new key, and `RESEND_FROM_EMAIL` (e.g., `notifications@myclub.com`).
5. Redeploy your app in Vercel to apply the new environment variables.

