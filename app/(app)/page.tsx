import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentMonthInTimezone } from "@/lib/utils/dates";
import { aggregatePercent, goalPercent } from "@/lib/utils/progress";
import { FamilySummaryBar } from "@/components/family/family-summary-bar";
import { ActivityFeed } from "@/components/family/activity-feed";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, family_id, timezone")
    .eq("id", user.id)
    .single();

  if (!profile?.family_id) {
    redirect("/onboarding/create-family");
  }

  const timezone = profile.timezone ?? "America/Denver";
  const monthStart = currentMonthInTimezone(timezone);

  const { data: family } = await supabase
    .from("families")
    .select("name")
    .eq("id", profile.family_id)
    .maybeSingle();

  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("family_id", profile.family_id)
    .order("full_name");

  const { data: goals } = await supabase
    .from("goals")
    .select("id, user_id, title")
    .eq("is_active", true)
    .in("user_id", (members ?? []).map((m) => m.id));

  const goalIds = (goals ?? []).map((g) => g.id);

  const [{ data: targets }, { data: monthCheckins }] = await Promise.all([
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
  ]);

  const targetByGoal = new Map(
    (targets ?? []).map((t) => [t.goal_id, t.target]),
  );
  const countByGoal = new Map<string, number>();
  for (const c of monthCheckins ?? []) {
    countByGoal.set(c.goal_id, (countByGoal.get(c.goal_id) ?? 0) + 1);
  }

  const memberSummaries = (members ?? []).map((member) => {
    const memberGoals = (goals ?? []).filter((g) => g.user_id === member.id);
    const progress = memberGoals.map((g) => ({
      goalId: g.id,
      title: g.title,
      checkinCount: countByGoal.get(g.id) ?? 0,
      target: targetByGoal.get(g.id) ?? null,
    }));

    return {
      userId: member.id,
      fullName: member.full_name,
      summaryPercent: aggregatePercent(progress),
      goals: progress.map((p) => ({
        goalId: p.goalId,
        title: p.title,
        checkinCount: p.checkinCount,
        target: p.target,
        percent: goalPercent(p),
      })),
    };
  });

  const { data: recentCheckins } = await supabase
    .from("checkins")
    .select(
      "id, checkin_date, note, created_at, user_id, goal_id, goals(title), profiles(full_name)",
    )
    .in("goal_id", goalIds.length > 0 ? goalIds : [""])
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">
        {family?.name ?? "Your family"}
      </h1>
      <p className="mb-6 text-zinc-600">Welcome, {profile.full_name}.</p>

      <div className="mb-8 flex flex-col gap-3">
        {memberSummaries.map((summary) => (
          <FamilySummaryBar key={summary.userId} summary={summary} />
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-zinc-900">
        Recent activity
      </h2>
      <ActivityFeed
        currentUserId={user.id}
        familyMemberIds={(members ?? []).map((m) => m.id)}
        initialCheckins={recentCheckins ?? []}
      />
    </div>
  );
}
