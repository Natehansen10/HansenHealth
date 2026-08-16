import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHealthOverview, seriesFrom } from "@/lib/data/health";
import {
  HEALTH_METRIC_BY_KEY,
  formatMetricValue,
  formatShortDate,
  isHealthRange,
  type HealthMetricKey,
} from "@/lib/utils/health";
import {
  BloodPressureCard,
  MetricTrendCard,
} from "@/components/health/trend-card";
import { MetricManager } from "@/components/health/metric-manager";
import { PersonalMetricCard } from "@/components/health/personal-metric-card";
import { RangePicker } from "@/components/health/range-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

// Metrics that get their own full trend card, in display order. Systolic
// and diastolic are absent on purpose -- they're rendered together by
// BloodPressureCard, since a systolic reading without its diastolic is not
// a meaningful thing to chart on its own.
const TREND_KEYS: HealthMetricKey[] = [
  "weight",
  "body_fat_percent",
  "resting_heart_rate",
  "sleep_hours",
  "sleep_quality",
  "steps",
];

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, timezone")
    .eq("id", user.id)
    .single();

  if (!profile?.family_id) {
    redirect("/onboarding/create-family");
  }

  // Validated against the known set, never passed through raw -- same
  // defensive shape as parseMonthParam in lib/utils/dates.ts.
  const activeRange = isHealthRange(range) ? range : "90";

  const overview = await getHealthOverview(
    user.id,
    profile.timezone ?? "America/Denver",
    Number(activeRange),
  );

  const trendCards = TREND_KEYS.map((key) => ({
    key,
    def: HEALTH_METRIC_BY_KEY[key],
    points: seriesFrom(overview.logs, key),
  })).filter((card) => card.points.length > 0);

  const systolic = seriesFrom(overview.logs, "systolic");
  const diastolic = seriesFrom(overview.logs, "diastolic");
  const hasBloodPressure = systolic.length > 0 || diastolic.length > 0;
  const hasAnyTrend = trendCards.length > 0 || hasBloodPressure;

  const recentLogs = [...overview.logs].reverse().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
          Health
        </h1>
        <Link href="/log?section=body">
          <Button type="button">Log today</Button>
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted">
        {overview.visibility === "family"
          ? "Shared with your family. Change this in Settings."
          : "Private to you. Nobody else in your family can see this."}
      </p>

      {!overview.hasAnyData ? (
        <EmptyState
          title="No health data yet"
          description="Log a weight, blood pressure, sleep, or step count and your trends will show up here."
          action={
            <Link href="/log?section=body">
              <Button type="button">Log your first entry</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-6">
            <RangePicker value={activeRange} />
          </div>

          {hasAnyTrend ? (
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {trendCards.map((card) => (
                <MetricTrendCard
                  key={card.key}
                  def={card.def}
                  points={card.points}
                  weightUnit={overview.weightUnit}
                />
              ))}
              {hasBloodPressure && (
                <BloodPressureCard
                  systolic={systolic}
                  diastolic={diastolic}
                />
              )}
            </div>
          ) : (
            // Distinct from the first-run state above: this user HAS logged
            // data, just none inside the selected window. Offering a wider
            // range is the useful action; "log your first entry" would be
            // wrong and slightly insulting.
            <EmptyState
              className="mb-8"
              title="Nothing in this range"
              description={`You've logged health data before, but nothing in the last ${activeRange} days.`}
              action={
                <Link href="/health?range=365">
                  <Button type="button">Show the last year</Button>
                </Link>
              }
            />
          )}
        </>
      )}

      <h2 className="mb-1 text-lg font-semibold text-foreground">
        Your metrics
      </h2>
      <p className="mb-3 text-sm text-muted">
        Anything the built-in metrics don&rsquo;t cover.
      </p>
      <div className="mb-6 flex flex-col gap-3">
        {overview.metrics
          .filter((m) => m.is_active)
          .map((metric) => (
            <PersonalMetricCard
              key={metric.id}
              name={metric.name}
              unit={metric.unit}
              targetValue={metric.target_value}
              frequency={metric.frequency}
              points={metric.entries.map((e) => ({
                date: e.entry_date,
                value: e.value,
              }))}
            />
          ))}
      </div>

      {/* The manager repeats each metric's name, which reads as an
          accidental duplicate of the cards above without a heading telling
          you the second list is for editing rather than reading. */}
      <h3 className="mb-2 font-heading text-sm font-semibold text-muted uppercase">
        Manage metrics
      </h3>
      <div className="mb-8">
        <MetricManager metrics={overview.metrics} />
      </div>

      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Recent entries
      </h2>
      {recentLogs.length === 0 ? (
        <EmptyState
          title="No daily entries yet"
          description="Each day you log something, it shows up here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {recentLogs.map((log) => {
            const parts = (
              [
                "weight",
                "body_fat_percent",
                "resting_heart_rate",
                "sleep_hours",
                "sleep_quality",
                "steps",
              ] as HealthMetricKey[]
            )
              .filter((key) => log[key] !== null)
              .map((key) =>
                `${HEALTH_METRIC_BY_KEY[key].label} ${formatMetricValue(
                  HEALTH_METRIC_BY_KEY[key],
                  log[key] as number,
                  overview.weightUnit,
                )}`,
              );

            if (log.systolic !== null || log.diastolic !== null) {
              parts.push(
                `BP ${log.systolic ?? "--"}/${log.diastolic ?? "--"}`,
              );
            }

            return (
              <Card key={log.id} className="p-3">
                <p className="text-sm font-medium text-foreground">
                  {formatShortDate(log.log_date)}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {parts.length > 0 ? parts.join(" · ") : "No values recorded"}
                </p>
                {log.note && (
                  <p className="mt-1 text-sm text-foreground italic">
                    &ldquo;{log.note}&rdquo;
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
