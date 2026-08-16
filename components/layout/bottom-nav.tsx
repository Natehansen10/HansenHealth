"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, isActivePath } from "@/components/layout/nav-links";

// Fixed bottom tab bar, phones only (hidden from sm: up, where the top bar
// carries the same links inline). This replaced a hamburger menu: primary
// navigation on a phone belongs within thumb reach, not behind a tap at the
// top corner of the screen.
//
// pb-[env(safe-area-inset-bottom)] keeps the row clear of the iOS home
// indicator, which matters here because the app is installable to the home
// screen and runs standalone (see app/layout.tsx appleWebApp).
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="flex">
        {NAV_LINKS.map((link) => {
          const active = isActivePath(pathname, link.href);
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] transition-colors ${
                  active
                    ? "font-medium text-accent-900"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {link.icon}
                <span>{link.shortLabel ?? link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
