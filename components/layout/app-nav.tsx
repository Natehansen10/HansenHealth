"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/goals", label: "Goals" },
  { href: "/checkin", label: "Check in" },
  { href: "/prizes", label: "Prizes" },
  { href: "/settings", label: "Settings" },
];

export function AppNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="border-b border-divider">
      <div className="mx-auto flex max-w-2xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="mr-auto flex items-center gap-2 font-heading text-lg font-semibold text-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 100 100" aria-hidden="true">
            <rect x="8" y="10" width="14" height="80" fill="var(--color-accent-900)" />
            <rect x="43" y="10" width="14" height="80" fill="var(--color-accent-900)" />
            <rect x="78" y="10" width="14" height="80" fill="var(--color-accent-900)" />
            <rect x="8" y="43" width="49" height="14" fill="var(--color-accent-900)" />
            <rect x="43" y="43" width="49" height="14" fill="var(--color-accent-900)" />
          </svg>
          Hansen Health
        </Link>

        <div className="hidden items-center gap-4 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="text-sm text-foreground hover:text-accent-900 aria-[current=page]:text-accent-900 aria-[current=page]:font-medium"
            >
              {link.label}
            </Link>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-muted hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>

        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="border border-divider p-2 sm:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {menuOpen ? (
              <>
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </>
            ) : (
              <>
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </>
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="flex flex-col gap-1 border-t border-divider px-4 py-3 sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className="py-2 text-sm text-foreground aria-[current=page]:text-accent-900 aria-[current=page]:font-medium"
            >
              {link.label}
            </Link>
          ))}
          <form action={signOut}>
            <button
              type="submit"
              className="py-2 text-left text-sm text-muted hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}
