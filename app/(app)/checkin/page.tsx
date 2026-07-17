import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayInTimezone, currentMonthInTimezone } from "@/lib/utils/dates";
import { GoalCheckinRow } from "@/components/checkins/goal-checkin-row";

export default async function CheckinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  const timezone = profile?.timezone ?? "America/Denver";
  const today = todayInTimezone(timezone);
  const monthStart = currentMonthInTimezone(timezone);

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, category")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (!goals || goals.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-semibold text-foreground">
          Check in
        </h1>
        <p className="text-muted">No active goals to check in on yet.</p>
      </div>
    );
  }

  const goalIds = goals.map((g) => g.id);

  const [{ data: targets }, { data: monthCheckins }, { data: todayCheckins }] =
    await Promise.all([
      supabase
        .from("goal_monthly_targets")
        .select("goal_id, target")
        .eq("month", monthStart)
        .in("goal_id", goalIds),
      supabase
        .from("checkins")
        .select("goal_id")
        .in("goal_id", goalIds)
        .gte("checkin_date", monthStart),
      supabase
        .from("checkins")
        .select("id, goal_id, note, created_at")
        .in("goal_id", goalIds)
        .eq("checkin_date", today),
    ]);

  const targetByGoal = new Map(
    (targets ?? []).map((t) => [t.goal_id, t.target]),
  );
  const countByGoal = new Map<string, number>();
  for (const c of monthCheckins ?? []) {
    countByGoal.set(c.goal_id, (countByGoal.get(c.goal_id) ?? 0) + 1);
  }
  const todayCheckinByGoal = new Map(
    (todayCheckins ?? []).map((c) => [c.goal_id, c]),
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">Check in</h1>
      <div className="flex flex-col gap-4">
        {goals.map((goal) => (
          <GoalCheckinRow
            key={goal.id}
            goal={goal}
            today={today}
            target={targetByGoal.get(goal.id) ?? null}
            monthCount={countByGoal.get(goal.id) ?? 0}
            todayCheckin={todayCheckinByGoal.get(goal.id) ?? null}
          />
        ))}
      </div>
    </div>
  );
}
