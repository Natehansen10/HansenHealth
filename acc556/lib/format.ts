// Display helpers. Inputs are plain YYYY-MM-DD strings from the database,
// formatted in UTC so the server's own timezone can never shift a date.

const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortMonthFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function utc(date: string): Date {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`);
}

export function formatMonth(month: string): string {
  return monthFmt.format(utc(month));
}

export function formatShortMonth(month: string): string {
  return shortMonthFmt.format(utc(month));
}

export function formatDay(date: string): string {
  return dayFmt.format(utc(date));
}

export function pct(value: number | null): string {
  return value === null ? "–" : `${value.toFixed(1)}%`;
}
