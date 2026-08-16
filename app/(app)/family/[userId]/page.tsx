import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { currentMonthInTimezone } from "@/lib/utils/dates";
import { goalPercent } from "@/lib/utils/progress";
import { getSharedHealthSummary, seriesFrom } from "@/lib/data/health";
import { HEALTH_METRIC_BY_KEY, type HealthMetricKey } from "@/lib/utils/health";
import {
  BloodPressureCard,
  MetricTrendCard,
} from "@/components/health/trend-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";

// Deliberately the same set the owner sees on their own /health page.
// Sharing is all-or-nothing at the RLS layer, so hiding a metric here
// would only make the owner believe something is private that a family
// member can still read straight off the API -- worse than showing it.
const SHARED_TREND_KEYS: HealthMetricKey[] = [
  "weight",
  "body_fat_percent",
  "resting_heart_rate",
  "sleep_hours",
  "sleep_quality",
  "steps",
];

export default async function FamilyMemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const { data: member } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (!member) {
    // Either no such profile, or RLS hid it because they're not in your
    // family -- both cases should look identical to the viewer.
    notFound();
  }

  const timezone = viewerProfile?.timezone ?? "America/Denver";
  const monthStart = currentMonthInTimezone(timezone);

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, category, is_active")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  const goalIds = (goals ?? []).map((g) => g.id);

  const [{ data: targets }, { data: monthCheckins }, { data: history }] =
    await Promise.all([
      supabase
        .from("goal_monthly_targets")
        .select("goal_id, target")
        .eq("month", monthStart)
        .in("goal_id", goalIds.length > 0 ? goalIds : [""]),
      supabase
        .from("checkins")
        .select("goal_id")
        .in("goal_id", goalIds.length > 0 ? goalIds : [""])
        .gte("checkin_date", monthStart),
      supabase
        .from("checkins")
        .select("id, checkin_date, note, goal_id, goals(title)")
        .in("goal_id", goalIds.length > 0 ? goalIds : [""])
        .order("checkin_date", { ascending: false })
        .limit(30),
    ]);

  const targetByGoal = new Map(
    (targets ?? []).map((t) => [t.goal_id, t.target]),
  );
  const countByGoal = new Map<string, number>();
  for (const c of monthCheckins ?? []) {
    countByGoal.set(c.goal_id, (countByGoal.get(c.goal_id) ?? 0) + 1);
  }

  // Returns null unless this member has set health_visibility = 'family'.
  // RLS would hide the rows either way; the null distinguishes "not shared"
  // (render nothing at all) from "shared but empty" (render an empty state).
  const sharedHealth = await getSharedHealthSummary(userId, timezone, 90);
  const sharedTrends = sharedHealth
    ? SHARED_TREND_KEYS.map((key) => ({
        key,
        def: HEALTH_METRIC_BY_KEY[key],
        points: seriesFrom(sharedHealth.logs, key),
      })).filter((t) => t.points.length > 0)
    : [];
  const sharedSystolic = sharedHealth
    ? seriesFrom(sharedHealth.logs, "systolic")
    : [];
  const sharedDiastolic = sharedHealth
    ? seriesFrom(sharedHealth.logs, "diastolic")
    : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <Link href="/" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted">
        &larr; Back to dashboard
      </Link>
      <h1 className="mb-6 text-xl font-semibold text-foreground sm:text-2xl">
        {member.full_name}
      </h1>

      <h2 className="mb-3 text-lg font-semibold text-foreground">Goals</h2>
      {!goals || goals.length === 0 ? (
        <EmptyState
          className="mb-8"
          title="No goals yet"
          description={`${member.full_name} hasn't set a goal yet.`}
        />
      ) : (
        <div className="mb-8 flex flex-col gap-4">
          {goals.map((goal) => {
            const target = targetByGoal.get(goal.id) ?? null;
            const checkinCount = countByGoal.get(goal.id) ?? 0;
            const percent = goalPercent({
              goalId: goal.id,
              checkinCount,
              target,
            });

            return (
              <Card
                key={goal.id}
                className={goal.is_active ? "" : "opacity-60"}
              >
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">
                    {goal.title}
                  </span>
                  <span className="text-muted">
                    {target !== null
                      ? `${checkinCount} of ${target} (${percent}%)`
                      : "target not yet set"}
                  </span>
                </div>
                <ProgressBar percent={percent} />
              </Card>
            );
          })}
        </div>
      )}

      {sharedHealth && (
        <>
          <h2 className="mb-1 text-lg font-semibold text-foreground">
            Health
          </h2>
          <p className="mb-3 text-sm text-muted">
            {member.full_name} shares their health log with the family. Last
            90 days.
          </p>
          {sharedTrends.length === 0 &&
          sharedSystolic.length === 0 &&
          sharedDiastolic.length === 0 ? (
            <EmptyState
              className="mb-8"
              title="Nothing logged yet"
              description={`${member.full_name} shares their health log but hasn't recorded anything in the last 90 days.`}
            />
          ) : (
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sharedTrends.map((trend) => (
                <MetricTrendCard
                  key={trend.key}
                  def={trend.def}
                  points={trend.points}
                  weightUnit={sharedHealth.weightUnit}
                />
              ))}
              {(sharedSystolic.length > 0 || sharedDiastolic.length > 0) && (
                <BloodPressureCard
                  systolic={sharedSystolic}
                  diastolic={sharedDiastolic}
                />
              )}
            </div>
          )}
        </>
      )}

      <h2 className="mb-3 text-lg font-semibold text-foreground">History</h2>
      {!history || history.length === 0 ? (
        <EmptyState
          title="No check-ins yet"
          description={`${member.full_name}'s check-ins will show up here.`}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {history.map((entry) => {
            const goalTitle = Array.isArray(entry.goals)
              ? entry.goals[0]?.title
              : entry.goals?.title;

            return (
              <li
                key={entry.id}
                className="border border-divider px-3 py-2 text-sm"
              >
                <span className="text-muted">{entry.checkin_date}</span>{" "}
                <span className="text-foreground">
                  {goalTitle ?? "a goal"}
                </span>
                {entry.note && (
                  <span className="text-muted"> — {entry.note}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
