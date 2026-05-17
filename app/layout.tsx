import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { createClient } from '@/lib/supabase/server';

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

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch settings
  const { data: settingsData } = await supabase
    .from('settings')
    .select('key, value')

  const settingsMap = settingsData?.reduce((acc: Record<string, string>, setting: { key: string, value: string }) => {
    acc[setting.key] = setting.value
    return acc
  }, {} as Record<string, string>) || {}

  const clubName = settingsMap['club_name'] || 'Highland Cal'

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-foreground">
        <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl px-4 md:px-6 shadow-sm">
          <Link href="/" className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
            {clubName}
          </Link>
          {user && (
            <nav className="flex items-center gap-4">
              <Link href="/dashboard" className="text-sm font-bold text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors">
                Dashboard
              </Link>
            </nav>
          )}
        </header>
        
        {children}

        <footer className="border-t border-slate-200/60 dark:border-slate-800/60 py-6 md:py-0 mt-auto bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
          <div className="container mx-auto flex flex-col items-center justify-center gap-4 md:h-16 md:flex-row px-4">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              © {new Date().getFullYear()} {clubName}. All rights reserved.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
