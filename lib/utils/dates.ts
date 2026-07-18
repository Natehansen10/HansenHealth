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

// Parses a "?month=YYYY-MM" search param into a validated YYYY-MM-01 string.
// Falls back to the current month (in the given timezone) for anything
// missing/malformed/out-of-range -- never lets an arbitrary unvalidated
// string reach a DB query.
export function parseMonthParam(
  monthParam: string | undefined,
  timezone: string,
): string {
  const fallback = currentMonthInTimezone(timezone);

  if (!monthParam) return fallback;

  const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
  if (!match) return fallback;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return fallback;
  if (year < 2000 || year > 2100) return fallback;

  return `${match[1]}-${match[2]}-01`;
}

// Number of days in the given YYYY-MM-01 month string, calendar-correct
// (handles leap years) without relying on browser/server local time --
// this is pure date-math on the parsed Y/M, not a "what time is it" read.
export function daysInMonth(monthStart: string): number {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// YYYY-MM-01 string for the month before/after the given one.
export function shiftMonth(monthStart: string, delta: number): string {
  const [year, month] = monthStart.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// "YYYY-MM-DD" for a given day number (1-based) within the given
// YYYY-MM-01 month string.
export function dateInMonth(monthStart: string, day: number): string {
  return `${monthStart.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

// Day-of-week (0 = Sunday ... 6 = Saturday) that the 1st of the given
// YYYY-MM-01 month falls on. Pure calendar math on the parsed Y/M, not a
// "what time is it" read -- used to pad a calendar grid so day 1 lands in
// its real weekday column instead of always starting at column 1.
export function firstWeekdayOfMonth(monthStart: string): number {
  const [year, month] = monthStart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}
