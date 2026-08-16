// Single source of truth for the app's primary navigation, shared by the
// desktop top bar and the mobile bottom bar so the two can't drift apart.
//
// Icons are inline stroke paths sized to a 24-box, matching the hairline
// weight of the rest of the Industry system. No icon library: five glyphs
// don't justify a dependency.

export type NavLink = {
  href: string;
  label: string;
  // Bottom-bar label, shortened where the full one won't fit a fifth of a
  // narrow phone screen.
  shortLabel?: string;
  icon: React.ReactNode;
};

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const NAV_LINKS: NavLink[] = [
  {
    href: "/",
    label: "Dashboard",
    shortLabel: "Home",
    icon: (
      <svg {...iconProps}>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    href: "/log",
    label: "Log",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/health",
    label: "Health",
    icon: (
      <svg {...iconProps}>
        <path d="M3 12h4l2-6 4 12 2-6h6" />
      </svg>
    ),
  },
  {
    href: "/goals",
    label: "Goals",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1" />
      </svg>
    ),
  },
  {
    href: "/prizes",
    label: "Prizes",
    icon: (
      <svg {...iconProps}>
        <path d="M4 9h16v11H4zM2 5h20v4H2zM12 5v15" />
        <path d="M12 5C12 5 9 2 7 3s0 4 5 2c3-2 5-2 5 0s-5 0-5 0" />
      </svg>
    ),
  },
];

// Settings is deliberately not in the bottom bar: five targets is the most
// that stays comfortably tappable across a 320px screen, and settings is
// the one destination people visit rarely. It lives in the top bar instead.
export const SETTINGS_LINK = "/settings";

// "/" must match exactly or it would light up on every route; everything
// else matches its subtree so /goals/new keeps Goals marked current.
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
