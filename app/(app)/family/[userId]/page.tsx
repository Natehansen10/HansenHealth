import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { currentMonthInTimezone } from "@/lib/utils/dates";
import { goalPercent } from "@/lib/utils/progress";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="mb-4 inline-block text-sm text-muted">
        &larr; Back to dashboard
      </Link>
      <h1 className="mb-6 text-2xl font-semibold text-foreground">
        {member.full_name}
      </h1>

      <h2 className="mb-3 text-lg font-semibold text-foreground">Goals</h2>
      {!goals || goals.length === 0 ? (
        <p className="mb-8 text-muted">No goals yet.</p>
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

      <h2 className="mb-3 text-lg font-semibold text-foreground">History</h2>
      {!history || history.length === 0 ? (
        <p className="text-muted">No check-ins yet.</p>
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
