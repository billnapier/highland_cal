import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { createClient } from '@/lib/supabase/server';
import LoginButton from '@/components/LoginButton';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Highland Cal",
  description: "Schedule of Highland Games and practices",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();

  /*
    ⚡ Bolt: Batch independent Supabase queries
    💡 What: Use Promise.all to fetch the user and settings concurrently instead of sequentially.
    🎯 Why: These two queries do not depend on each other. Running them sequentially causes a waterfall effect, delaying TTFB.
    📊 Impact: Reduces time spent waiting for the database by up to ~50% (from T1+T2 to Max(T1, T2)).
    🔬 Measurement: Verify faster page load times across the application since this is in the root layout.
  */
  const [userRes, settingsRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('settings').select('key, value')
  ]);

  const { data: { user } } = userRes;
  const { data: settingsData } = settingsRes;

  const settingsMap = settingsData?.reduce((acc: Record<string, string>, setting: { key: string, value: string }) => {
    acc[setting.key] = setting.value
    return acc
  }, {} as Record<string, string>) || {}

  const clubName = settingsMap['club_name'] || 'Highland Cal'

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased scroll-smooth`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-foreground">
        <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/50 dark:border-slate-800/40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl px-4 md:px-8 shadow-sm">
          <Link href="/" className="font-extrabold text-xl md:text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-300 hover:scale-[1.01] transition-transform flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400 font-normal">⛰️</span>
            {clubName}
          </Link>
          
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/#schedule" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Upcoming Events
              </Link>
              <Link href="/#roster" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Club Roster
              </Link>
              <Link href="/#about" className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                About Us
              </Link>
            </nav>
            
            <div className="flex items-center gap-3">
              {user ? (
                <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-600/10">
                  Dashboard
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <LoginButton text="Log In" variant="ghost" className="text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 px-3 py-2 rounded-xl transition-all" />
                  <LoginButton text="Join Club" variant="default" className="text-sm font-bold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-600/10" />
                </div>
              )}
            </div>
          </div>
        </header>
        
        {children}

        <footer className="border-t border-slate-200/50 dark:border-slate-800/40 py-8 mt-auto bg-white/50 dark:bg-slate-950/50 backdrop-blur-md">
          <div className="container mx-auto flex flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              © {new Date().getFullYear()} {clubName}. All rights reserved.
            </p>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Hey, want your own copy of this site for your club?{" "}
              <a 
                href="https://github.com/billnapier/highland_cal" 
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 underline underline-offset-4 transition-colors font-bold"
                target="_blank"
                rel="noopener noreferrer"
              >
                Go here
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
