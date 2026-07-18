import { createClient } from "@/lib/supabase/server";
import { currentMonthInTimezone, todayInTimezone } from "@/lib/utils/dates";

export type QuickCheckinGoal = {
  id: string;
  title: string;
  category: string | null;
};

export type QuickCheckinTodayCheckin = {
  id: string;
  goal_id: string;
  note: string | null;
  calories: number | null;
  distance: number | null;
  duration_minutes: number | null;
  author_message: string | null;
  created_at: string;
};

export type QuickCheckinData = {
  today: string;
  goals: QuickCheckinGoal[];
  targetByGoal: Map<string, number | null>;
  countByGoal: Map<string, number>;
  todayCheckinByGoal: Map<string, QuickCheckinTodayCheckin>;
};

// Fetches everything GoalCheckinRow needs for the current user's own active
// goals: today's status, this month's count, and this month's target.
// Shared by the dashboard's quick check-in modal -- this is the same query
// /checkin/page.tsx used before it became a history calendar view, moved
// here since it's now needed by exactly one caller (the dashboard) rather
// than the /checkin route.
export async function getQuickCheckinData(
  userId: string,
  timezone: string,
): Promise<QuickCheckinData> {
  const supabase = await createClient();

  const today = todayInTimezone(timezone);
  const monthStart = currentMonthInTimezone(timezone);

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, category")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const goalList = goals ?? [];
  const goalIds = goalList.map((g) => g.id);

  const [{ data: targets }, { data: monthCheckins }, { data: todayCheckins }] =
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
        .select(
          "id, goal_id, note, calories, distance, duration_minutes, author_message, created_at",
        )
        .in("goal_id", goalIds.length > 0 ? goalIds : [""])
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

  return {
    today,
    goals: goalList,
    targetByGoal,
    countByGoal,
    todayCheckinByGoal,
  };
}
