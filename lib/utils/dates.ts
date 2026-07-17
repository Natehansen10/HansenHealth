// "Today" as a YYYY-MM-DD string in the given IANA timezone -- never use
// server or browser local time directly for check-in day boundaries.
export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// First day of the current month as YYYY-MM-01 in the given timezone,
// matching goal_monthly_targets.month's snapshot boundary.
export function currentMonthInTimezone(timezone: string): string {
  return `${todayInTimezone(timezone).slice(0, 7)}-01`;
}
