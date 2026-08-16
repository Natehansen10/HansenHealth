"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";
import {
  NAV_LINKS,
  SETTINGS_LINK,
  isActivePath,
} from "@/components/layout/nav-links";

// Top bar. On phones this is just identity plus the two things that don't
// belong in the bottom tab bar (settings, sign out) -- primary navigation
// moved to components/layout/bottom-nav.tsx. From sm: up the full link row
// renders inline and the bottom bar is hidden.
//
// Sticky rather than static so the app name and settings stay reachable
// while scrolling a long dashboard.
export function AppNav({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const settingsActive = isActivePath(pathname, SETTINGS_LINK);

  return (
    <nav className="sticky top-0 z-30 border-b border-divider bg-background">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          className="mr-auto flex min-w-0 items-center gap-2 font-heading text-lg font-semibold text-foreground"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 100 100"
            aria-hidden="true"
            className="flex-shrink-0"
          >
            <rect x="8" y="10" width="14" height="80" fill="var(--color-accent-900)" />
            <rect x="43" y="10" width="14" height="80" fill="var(--color-accent-900)" />
            <rect x="78" y="10" width="14" height="80" fill="var(--color-accent-900)" />
            <rect x="8" y="43" width="49" height="14" fill="var(--color-accent-900)" />
            <rect x="43" y="43" width="49" height="14" fill="var(--color-accent-900)" />
          </svg>
          <span className="truncate">Hansen Health</span>
          {userName && (
            <span className="hidden truncate font-body text-sm font-normal text-muted sm:inline">
              — {userName}
            </span>
          )}
        </Link>

        <div className="hidden items-center gap-4 sm:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
              className="text-sm text-foreground hover:text-accent-900 aria-[current=page]:font-medium aria-[current=page]:text-accent-900"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link
          href={SETTINGS_LINK}
          aria-current={settingsActive ? "page" : undefined}
          aria-label="Settings"
          className={`flex min-h-11 min-w-11 items-center justify-center sm:min-h-0 sm:min-w-0 sm:text-sm ${
            settingsActive
              ? "font-medium text-accent-900"
              : "text-muted hover:text-foreground"
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="sm:hidden"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="hidden sm:inline">Settings</span>
        </Link>

        <form action={signOut} className="flex-shrink-0">
          <button
            type="submit"
            className="flex min-h-11 items-center text-sm text-muted hover:text-foreground sm:min-h-0"
          >
            <span className="hidden sm:inline">Sign out</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="sm:hidden"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            <span className="sr-only sm:hidden">Sign out</span>
          </button>
        </form>
      </div>
    </nav>
  );
}
