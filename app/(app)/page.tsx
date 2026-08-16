import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentMonthInTimezone } from "@/lib/utils/dates";
import { aggregatePercent, goalPercent } from "@/lib/utils/progress";
import { FamilySummaryBar } from "@/components/family/family-summary-bar";
import { ActivityFeed } from "@/components/family/activity-feed";
import { PrizeBanner } from "@/components/family/prize-banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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

  const [{ data: family }, { data: members }, { data: prizes }] =
    await Promise.all([
      supabase
        .from("families")
        .select("name")
        .eq("id", profile.family_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("family_id", profile.family_id)
        .order("full_name"),
      supabase
        .from("family_prizes")
        .select("individual_prize_description, group_prize_description")
        .eq("family_id", profile.family_id)
        .maybeSingle(),
    ]);

  const { data: goals } = await supabase
    .from("goals")
    .select("id, user_id, title, unit")
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
      unit: g.unit,
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
        unit: p.unit,
        checkinCount: p.checkinCount,
        target: p.target,
        percent: goalPercent(p),
      })),
    };
  });

  // Group prize unlocks when every member with at least one goal is
  // currently at or above 100% this month. This is a live "are we there
  // yet" indicator computed from the same data as the summary bars above --
  // distinct from monthly_prizes, which is the historical record written
  // once at month-end by the monthly-prize-calculation Edge Function.
  const membersWithGoals = memberSummaries.filter((m) => m.goals.length > 0);
  const groupPrizeUnlocked =
    membersWithGoals.length > 0 &&
    membersWithGoals.every((m) => (m.summaryPercent ?? 0) >= 100);

  const { data: recentCheckins } = await supabase
    .from("checkins")
    .select(
      "id, checkin_date, note, author_message, created_at, user_id, goal_id, goals(title), profiles(full_name)",
    )
    .in("goal_id", goalIds.length > 0 ? goalIds : [""])
    .order("created_at", { ascending: false })
    .limit(20);

  // Goal activity (edits) can reference a now-deactivated goal, so this
  // looks up ALL of the family's goals (not just is_active ones) to build
  // the id list -- an "deactivated X" event should still show even though
  // the goal itself is no longer active.
  const { data: allFamilyGoals } = await supabase
    .from("goals")
    .select("id")
    .in("user_id", (members ?? []).map((m) => m.id));
  const allGoalIds = (allFamilyGoals ?? []).map((g) => g.id);

  const { data: recentGoalActivity } = await supabase
    .from("goal_activity_log")
    .select("id, change_summary, created_at, user_id, goal_id, profiles(full_name)")
    .in("goal_id", allGoalIds.length > 0 ? allGoalIds : [""])
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <h1 className="mb-1 text-xl font-semibold text-foreground sm:text-2xl">
        {family?.name ?? "Your family"}
      </h1>
      <p className="mb-6 text-muted">Welcome, {profile.full_name}.</p>

      {/* Single entry point for everything loggable -- goal check-ins,
          weight, BP, sleep, steps, custom metrics. This replaced the
          dashboard's quick check-in modal, which could only do the first
          of those. */}
      <Link href="/log" className="mb-6 block">
        <Button type="button" className="w-full">
          Log today
        </Button>
      </Link>

      {(prizes?.individual_prize_description ||
        prizes?.group_prize_description) && (
        <PrizeBanner
          individualPrize={prizes?.individual_prize_description ?? null}
          groupPrize={prizes?.group_prize_description ?? null}
          groupPrizeUnlocked={groupPrizeUnlocked}
        />
      )}

      <div className="mb-8 flex flex-col gap-3">
        {memberSummaries.length === 0 ? (
          <EmptyState
            title="No family members yet"
            description="Invite the rest of the family and everyone's progress will show up here."
            action={
              <Link href="/settings/family">
                <Button type="button">Invite someone</Button>
              </Link>
            }
          />
        ) : membersWithGoals.length === 0 ? (
          // Members exist but nobody has set a goal yet -- a column of
          // empty progress bars reads as broken, so say what's actually
          // missing.
          <EmptyState
            title="No goals set yet"
            description="Once someone in the family creates a goal, everyone's monthly progress shows up here."
            action={
              <Link href="/goals/new">
                <Button type="button">Create the first goal</Button>
              </Link>
            }
          />
        ) : (
          memberSummaries.map((summary) => (
            <FamilySummaryBar key={summary.userId} summary={summary} />
          ))
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-foreground">
        Recent activity
      </h2>
      <ActivityFeed
        currentUserId={user.id}
        currentUserName={profile.full_name}
        familyMemberIds={(members ?? []).map((m) => m.id)}
        initialCheckins={recentCheckins ?? []}
        initialGoalActivity={recentGoalActivity ?? []}
      />
    </div>
  );
}
