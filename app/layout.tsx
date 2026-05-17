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

  const settingsMap = settingsData?.reduce((acc: any, setting: any) => {
    acc[setting.key] = setting.value
    return acc
  }, {}) || {}

  const clubName = settingsMap['club_name'] || 'Highland Cal'

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-6">
          <Link href="/" className="font-semibold text-lg tracking-tight">
            {clubName}
          </Link>
          {user && (
            <nav className="flex items-center gap-4">
              <Link href="/dashboard" className="text-sm font-medium hover:underline text-muted-foreground hover:text-foreground">
                Dashboard
              </Link>
            </nav>
          )}
        </header>
        {children}

        <footer className="border-t py-6 md:py-0 mt-auto">
          <div className="container flex flex-col items-center justify-center gap-4 md:h-16 md:flex-row">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {clubName}. All rights reserved.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
