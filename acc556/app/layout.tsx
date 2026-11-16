import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDbStats } from "@/lib/queries";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Health Tracker",
  description:
    "Family exercise goals, monthly targets, and prizes. ACC 556 final project.",
};

// Live row counts from the database, shown in the footer. Proof on every
// page that the app is reading Supabase, and it ticks up when you log a
// check-in.
async function DbFooter() {
  const s = await getDbStats().catch(() => null);
  if (!s) return <p>Database unavailable.</p>;
  return (
    <p>
      Live from Supabase: {s.members} members · {s.goals} goals ·{" "}
      {s.checkins} check-ins
    </p>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-divider bg-accent-900 text-white">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Family Health Tracker
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:underline">
                Leaderboard
              </Link>
              <Link href="/members" className="hover:underline">
                Members
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-divider px-4 py-4 text-center text-xs text-muted">
          <Suspense fallback={<p>Connecting to Supabase…</p>}>
            <DbFooter />
          </Suspense>
          <p className="mt-1">ACC 556 final project · all people are fictional</p>
        </footer>
      </body>
    </html>
  );
}
