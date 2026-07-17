import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentMonthInTimezone } from "@/lib/utils/dates";
import { aggregatePercent } from "@/lib/utils/progress";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

// Formats a `YYYY-MM-01` month string as e.g. "July 2026", without pulling
// in server/browser local time -- the date itself is already the month
// boundary computed in the user's timezone (or, for historical rows written
// by the Edge Function, a plain UTC month boundary), so this is just string
// -> label formatting, not a timezone-sensitive "what month is it" question.
function formatMonth(month: string): string {
  const [year, monthNum] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthNum) - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function PrizesPage() {
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

  const timezone = profile.timezone ?? "America/Denver";
  const monthStart = currentMonthInTimezone(timezone);

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("family_id", profile.family_id)
    .order("full_name");

  const { data: goals } = await supabase
    .from("goals")
    .select("id, user_id")
    .eq("is_active", true)
    .in("user_id", (members ?? []).map((m) => m.id));

  const goalIds = (goals ?? []).map((g) => g.id);

  const [{ data: targets }, { data: monthCheckins }, { data: prizes }] =
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
        .from("monthly_prizes")
        .select("month, user_id, profiles(full_name)")
        .eq("family_id", profile.family_id)
        .order("month", { ascending: false }),
    ]);

  const targetByGoal = new Map(
    (targets ?? []).map((t) => [t.goal_id, t.target]),
  );
  const countByGoal = new Map<string, number>();
  for (const c of monthCheckins ?? []) {
    countByGoal.set(c.goal_id, (countByGoal.get(c.goal_id) ?? 0) + 1);
  }

  const standings = (members ?? []).map((member) => {
    const memberGoals = (goals ?? []).filter((g) => g.user_id === member.id);
    const progress = memberGoals.map((g) => ({
      goalId: g.id,
      checkinCount: countByGoal.get(g.id) ?? 0,
      target: targetByGoal.get(g.id) ?? null,
    }));

    return {
      userId: member.id,
      fullName: member.full_name,
      hasGoals: memberGoals.length > 0,
      percent: aggregatePercent(progress),
    };
  });

  // Group prize history rows by month, preserving the descending month
  // order already applied by the query.
  const monthOrder: string[] = [];
  const winnersByMonth = new Map<string, string[]>();
  for (const prize of prizes ?? []) {
    const name = Array.isArray(prize.profiles)
      ? prize.profiles[0]?.full_name
      : prize.profiles?.full_name;
    if (!winnersByMonth.has(prize.month)) {
      monthOrder.push(prize.month);
      winnersByMonth.set(prize.month, []);
    }
    winnersByMonth.get(prize.month)!.push(name ?? "Someone");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Prizes</h1>

      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Current month standings
      </h2>
      <div className="mb-8 flex flex-col gap-3">
        {standings.map((s) => (
          <Card key={s.userId}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-foreground">{s.fullName}</span>
              <span className="text-sm text-muted">
                {s.hasGoals ? `${s.percent ?? 0}%` : "No goals yet"}
              </span>
            </div>
            <ProgressBar percent={s.percent} />
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Prize history
      </h2>
      {monthOrder.length === 0 ? (
        <p className="text-muted">
          No prizes awarded yet — keep logging check-ins!
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {monthOrder.map((month) => (
            <Card key={month}>
              <div className="mb-1 font-medium text-foreground">
                {formatMonth(month)}
              </div>
              <p className="text-sm text-muted">
                {winnersByMonth.get(month)!.join(", ")}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
