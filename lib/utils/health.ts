// Pure helpers and the single source of truth for the built-in health
// metrics. Zero imports: this file is shared by Server Components, Server
// Actions, and Client Components alike, and keeping it dependency-free is
// what lets all three agree on one definition of "what is a valid weight".
//
// The min/max below MIRROR THE CHECK CONSTRAINTS in
// 20260815000000_personal_health_logs.sql. If you change one, change the
// other -- the database is the real authority, and this copy exists only so
// the user gets an inline message instead of a raw Postgres constraint
// violation. They are wide sanity bounds (catching a transposed digit or a
// lb/kg mixup), not clinical ranges.

export type HealthMetricKey =
  | "weight"
  | "body_fat_percent"
  | "systolic"
  | "diastolic"
  | "resting_heart_rate"
  | "sleep_hours"
  | "sleep_quality"
  | "steps";

export type HealthMetricGroup = "body" | "vitals" | "sleep" | "activity";

export type HealthMetricDef = {
  key: HealthMetricKey;
  label: string;
  group: HealthMetricGroup;
  // Display suffix. null = unitless (a 1-5 rating, a raw count).
  unit: string | null;
  decimal: boolean;
  min: number;
  max: number;
  placeholder: string;
  // Whether a lower reading is the better direction, used only to color the
  // trend delta. null = no inherent good/bad direction (steps up is good,
  // weight depends on the person's goal, sleep quality up is good).
  lowerIsBetter: boolean | null;
};

export const HEALTH_METRICS: HealthMetricDef[] = [
  {
    key: "weight",
    label: "Weight",
    group: "body",
    unit: null, // filled in from profiles.weight_unit at display time
    decimal: true,
    min: 0.01,
    max: 2000,
    placeholder: "165.4",
    lowerIsBetter: null,
  },
  {
    key: "body_fat_percent",
    label: "Body fat",
    group: "body",
    unit: "%",
    decimal: true,
    min: 0,
    max: 100,
    placeholder: "18.5",
    lowerIsBetter: null,
  },
  {
    key: "systolic",
    label: "Systolic",
    group: "vitals",
    unit: "mmHg",
    decimal: false,
    min: 40,
    max: 300,
    placeholder: "118",
    lowerIsBetter: null,
  },
  {
    key: "diastolic",
    label: "Diastolic",
    group: "vitals",
    unit: "mmHg",
    decimal: false,
    min: 20,
    max: 250,
    placeholder: "76",
    lowerIsBetter: null,
  },
  {
    key: "resting_heart_rate",
    label: "Resting heart rate",
    group: "vitals",
    unit: "bpm",
    decimal: false,
    min: 20,
    max: 250,
    placeholder: "58",
    lowerIsBetter: null,
  },
  {
    key: "sleep_hours",
    label: "Sleep",
    group: "sleep",
    unit: "hrs",
    decimal: true,
    min: 0,
    max: 24,
    placeholder: "7.5",
    lowerIsBetter: false,
  },
  {
    key: "sleep_quality",
    label: "Sleep quality",
    group: "sleep",
    unit: "/ 5",
    decimal: false,
    min: 1,
    max: 5,
    placeholder: "4",
    lowerIsBetter: false,
  },
  {
    key: "steps",
    label: "Steps",
    group: "activity",
    unit: null,
    decimal: false,
    min: 0,
    max: 500000,
    placeholder: "8500",
    lowerIsBetter: false,
  },
];

export const HEALTH_METRIC_BY_KEY: Record<HealthMetricKey, HealthMetricDef> =
  Object.fromEntries(HEALTH_METRICS.map((m) => [m.key, m])) as Record<
    HealthMetricKey,
    HealthMetricDef
  >;

export const HEALTH_GROUP_LABELS: Record<HealthMetricGroup, string> = {
  body: "Body",
  vitals: "Vitals",
  sleep: "Sleep",
  activity: "Activity",
};

export function metricsInGroup(group: HealthMetricGroup): HealthMetricDef[] {
  return HEALTH_METRICS.filter((m) => m.group === group);
}

// A dated numeric reading. Structurally compatible with the chart
// primitive's ChartPoint on purpose -- these can be passed straight to
// <LineChart>/<Sparkline> without lib/ having to import from components/.
export type MetricPoint = { date: string; value: number };

export type ParsedMetric =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

// Parses one raw form field. An empty string is a deliberate "clear this
// value", not an error -- every metric is independently optional, and a day
// where you only logged steps is a legitimate row.
export function parseMetricInput(
  raw: string,
  def: HealthMetricDef,
): ParsedMetric {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };

  // Number("") is 0 and Number(" ") is 0, both already handled above.
  // Number("12abc") is NaN, which is what we want to reject here.
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `${def.label} must be a number.` };
  }

  if (!def.decimal && !Number.isInteger(parsed)) {
    return { ok: false, error: `${def.label} must be a whole number.` };
  }

  if (parsed < def.min || parsed > def.max) {
    return {
      ok: false,
      error: `${def.label} must be between ${def.min} and ${def.max}.`,
    };
  }

  return { ok: true, value: parsed };
}

export const SLEEP_QUALITY_LABELS: Record<number, string> = {
  1: "Terrible",
  2: "Poor",
  3: "OK",
  4: "Good",
  5: "Great",
};

// Display string for one reading. weightUnit is threaded through because
// weight is the one metric whose unit is a per-user display preference
// (profiles.weight_unit) rather than a fixed property of the metric -- and
// it is a LABEL ONLY, there is no conversion anywhere (see the migration).
export function formatMetricValue(
  def: HealthMetricDef,
  value: number,
  weightUnit = "lb",
): string {
  if (def.key === "sleep_quality") {
    return `${value} · ${SLEEP_QUALITY_LABELS[value] ?? ""}`.trim();
  }
  if (def.key === "steps") {
    return value.toLocaleString("en-US");
  }

  const shown = def.decimal
    ? String(Number(value.toFixed(2)))
    : String(Math.round(value));
  const unit = def.key === "weight" ? weightUnit : def.unit;
  return unit ? `${shown} ${unit}` : shown;
}

export type TrendDelta = {
  change: number;
  // "up" / "down" relative to the earliest reading in the window; "flat"
  // when they're equal. Direction only -- whether that's good news is the
  // caller's business (see HealthMetricDef.lowerIsBetter).
  direction: "up" | "down" | "flat";
};

// Change between the first and last reading in a window. Returns null for
// fewer than two readings, because "you have logged one weight" is not a
// trend and shouldn't be presented as one.
export function trendDelta(points: MetricPoint[]): TrendDelta | null {
  if (points.length < 2) return null;

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const change = last - first;

  return {
    change,
    direction: change === 0 ? "flat" : change > 0 ? "up" : "down",
  };
}

export function averageOf(points: MetricPoint[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, p) => sum + p.value, 0) / points.length;
}

// "Aug 15" for a YYYY-MM-DD string. Formats the parsed Y/M/D as a UTC
// instant so the label can never slide a day either way -- same reasoning
// as the month formatting in app/(app)/prizes/page.tsx.
export function formatShortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

// YYYY-MM-DD for `days` before the given YYYY-MM-DD, inclusive-window
// friendly. Pure UTC date math, not a "what time is it" read.
export function daysBefore(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d - days));
  return shifted.toISOString().slice(0, 10);
}

// Validates a client-supplied YYYY-MM-DD. Used by the Server Actions before
// any date reaches a query -- same defensive shape as parseMonthParam.
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 2000 || y > 2100) return false;
  // Rejects e.g. 2026-02-31, which passes the range checks above but is not
  // a real calendar date.
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

// Time windows offered on /health. These live here rather than next to the
// RangePicker component because the /health Server Component validates the
// ?range= param with isHealthRange() before querying -- and a Server
// Component cannot call a function exported from a "use client" module.
// (It compiles and type-checks fine; it throws at request time.)
export const HEALTH_RANGES = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
] as const;

export type HealthRange = (typeof HEALTH_RANGES)[number]["value"];

export function isHealthRange(value: string | undefined): value is HealthRange {
  return HEALTH_RANGES.some((r) => r.value === value);
}

export const PERSONAL_METRIC_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export type PersonalMetricFrequency =
  (typeof PERSONAL_METRIC_FREQUENCIES)[number]["value"];

export function isPersonalMetricFrequency(
  value: string,
): value is PersonalMetricFrequency {
  return PERSONAL_METRIC_FREQUENCIES.some((f) => f.value === value);
}
