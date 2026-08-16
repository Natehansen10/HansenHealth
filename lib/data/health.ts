import { createClient } from "@/lib/supabase/server";
import { todayInTimezone } from "@/lib/utils/dates";
import {
  daysBefore,
  type HealthMetricKey,
  type MetricPoint,
} from "@/lib/utils/health";

// Server-side read helpers for the personal health log. Everything here
// goes through the RLS-governed client (lib/supabase/server), never the
// service role -- these reads are exactly what RLS is for, and a helper
// that bypassed it would silently defeat the private-by-default design.

export type HealthLogRow = {
  id: string;
  log_date: string;
  weight: number | null;
  body_fat_percent: number | null;
  systolic: number | null;
  diastolic: number | null;
  resting_heart_rate: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  steps: number | null;
  note: string | null;
};

export type PersonalMetricEntryRow = {
  id: string;
  entry_date: string;
  value: number;
  note: string | null;
};

export type PersonalMetricWithEntries = {
  id: string;
  name: string;
  unit: string | null;
  target_value: number | null;
  frequency: string;
  is_active: boolean;
  // Ascending by date, so it can go straight into a chart.
  entries: PersonalMetricEntryRow[];
  latest: PersonalMetricEntryRow | null;
  todayEntry: PersonalMetricEntryRow | null;
};

const LOG_COLUMNS =
  "id, log_date, weight, body_fat_percent, systolic, diastolic, resting_heart_rate, sleep_hours, sleep_quality, steps, note";

// Pure: pulls one metric's non-null readings out of a set of daily rows,
// preserving their order. Exported so pages can build several series from a
// single fetch rather than querying per chart.
export function seriesFrom(
  logs: HealthLogRow[],
  key: HealthMetricKey,
): MetricPoint[] {
  return logs
    .filter((log) => log[key] !== null)
    .map((log) => ({ date: log.log_date, value: log[key] as number }));
}

export type HealthOverview = {
  today: string;
  rangeStart: string;
  weightUnit: string;
  visibility: string;
  // Ascending by log_date across the requested window.
  logs: HealthLogRow[];
  todayLog: HealthLogRow | null;
  metrics: PersonalMetricWithEntries[];
  // True when the user has never logged anything at all -- distinct from
  // "nothing in the selected window", which should offer a wider range
  // rather than a first-run empty state.
  hasAnyData: boolean;
};

// Everything /health needs: the daily rows in the chosen window, the user's
// personal metrics with their entries, and the two display preferences.
export async function getHealthOverview(
  userId: string,
  timezone: string,
  rangeDays: number,
): Promise<HealthOverview> {
  const supabase = await createClient();

  const today = todayInTimezone(timezone);
  const rangeStart = daysBefore(today, rangeDays);

  const [{ data: profile }, { data: logs }, { data: metrics }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("weight_unit, health_visibility")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("health_logs")
        .select(LOG_COLUMNS)
        .eq("user_id", userId)
        .gte("log_date", rangeStart)
        .lte("log_date", today)
        .order("log_date", { ascending: true }),
      supabase
        .from("personal_metrics")
        .select("id, name, unit, target_value, frequency, is_active")
        .eq("user_id", userId)
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);

  const metricList = metrics ?? [];
  const metricIds = metricList.map((m) => m.id);

  // One query for every metric's entries rather than N queries; the window
  // matches the charts above so a metric's sparkline covers the same span
  // as the built-in ones.
  const { data: entries } = await supabase
    .from("personal_metric_entries")
    .select("id, metric_id, entry_date, value, note")
    .in("metric_id", metricIds.length > 0 ? metricIds : [""])
    .gte("entry_date", rangeStart)
    .lte("entry_date", today)
    .order("entry_date", { ascending: true });

  const entriesByMetric = new Map<string, PersonalMetricEntryRow[]>(
    metricIds.map((id) => [id, []]),
  );
  for (const entry of entries ?? []) {
    entriesByMetric.get(entry.metric_id)?.push({
      id: entry.id,
      entry_date: entry.entry_date,
      value: entry.value,
      note: entry.note,
    });
  }

  const logRows = (logs ?? []) as HealthLogRow[];

  // "Has the user ever logged anything" can't be answered from the windowed
  // query above, so ask separately -- but only when the window came back
  // empty, since a non-empty window already answers it yes.
  let hasAnyData = logRows.length > 0 || (entries ?? []).length > 0;
  if (!hasAnyData) {
    const [{ count: logCount }, { count: entryCount }] = await Promise.all([
      supabase
        .from("health_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("personal_metric_entries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
    hasAnyData = (logCount ?? 0) > 0 || (entryCount ?? 0) > 0;
  }

  return {
    today,
    rangeStart,
    weightUnit: profile?.weight_unit ?? "lb",
    visibility: profile?.health_visibility ?? "private",
    logs: logRows,
    todayLog: logRows.find((l) => l.log_date === today) ?? null,
    metrics: metricList.map((metric) => {
      const metricEntries = entriesByMetric.get(metric.id) ?? [];
      return {
        ...metric,
        entries: metricEntries,
        latest: metricEntries[metricEntries.length - 1] ?? null,
        todayEntry:
          metricEntries.find((e) => e.entry_date === today) ?? null,
      };
    }),
    hasAnyData,
  };
}

export type HealthLogFormData = {
  today: string;
  weightUnit: string;
  todayLog: HealthLogRow | null;
  metrics: {
    id: string;
    name: string;
    unit: string | null;
    target_value: number | null;
    frequency: string;
    todayValue: number | null;
  }[];
};

// The subset /log needs: today's row (to prefill) and the active personal
// metrics with today's value if already entered.
export async function getHealthLogFormData(
  userId: string,
  timezone: string,
): Promise<HealthLogFormData> {
  const supabase = await createClient();
  const today = todayInTimezone(timezone);

  const [{ data: profile }, { data: todayLog }, { data: metrics }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("weight_unit")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("health_logs")
        .select(LOG_COLUMNS)
        .eq("user_id", userId)
        .eq("log_date", today)
        .maybeSingle(),
      supabase
        .from("personal_metrics")
        .select("id, name, unit, target_value, frequency")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ]);

  const metricList = metrics ?? [];
  const metricIds = metricList.map((m) => m.id);

  const { data: todayEntries } = await supabase
    .from("personal_metric_entries")
    .select("metric_id, value")
    .in("metric_id", metricIds.length > 0 ? metricIds : [""])
    .eq("entry_date", today);

  const valueByMetric = new Map(
    (todayEntries ?? []).map((e) => [e.metric_id, e.value]),
  );

  return {
    today,
    weightUnit: profile?.weight_unit ?? "lb",
    todayLog: (todayLog as HealthLogRow | null) ?? null,
    metrics: metricList.map((m) => ({
      ...m,
      todayValue: valueByMetric.get(m.id) ?? null,
    })),
  };
}

export type SharedHealthSummary = {
  logs: HealthLogRow[];
  weightUnit: string;
};

// What another family member is allowed to see on /family/[userId].
// Returns null when that person has not opted into family sharing.
//
// RLS is the real gate here -- health_owner_visible_to_me() would return no
// rows for a private user regardless of what this function did. The
// explicit visibility read exists so the UI can tell "shares nothing"
// (render nothing) apart from "shares, but hasn't logged yet" (render an
// empty state), which an empty result set alone can't distinguish.
export async function getSharedHealthSummary(
  ownerId: string,
  timezone: string,
  rangeDays: number,
): Promise<SharedHealthSummary | null> {
  const supabase = await createClient();

  const { data: owner } = await supabase
    .from("profiles")
    .select("health_visibility, weight_unit")
    .eq("id", ownerId)
    .maybeSingle();

  if (owner?.health_visibility !== "family") return null;

  const today = todayInTimezone(timezone);
  const { data: logs } = await supabase
    .from("health_logs")
    .select(LOG_COLUMNS)
    .eq("user_id", ownerId)
    .gte("log_date", daysBefore(today, rangeDays))
    .lte("log_date", today)
    .order("log_date", { ascending: true });

  return {
    logs: (logs ?? []) as HealthLogRow[],
    weightUnit: owner.weight_unit ?? "lb",
  };
}
