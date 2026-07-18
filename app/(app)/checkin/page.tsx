import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  parseMonthParam,
  shiftMonth,
  dateInMonth,
  daysInMonth,
} from "@/lib/utils/dates";
import { GoalCalendar, type CheckinDetail } from "@/components/checkins/goal-calendar";

// This page reviews past completion (a per-goal calendar) -- it is no
// longer where "today's check-in" happens. That moved to the dashboard's
// quick check-in modal (see app/(app)/page.tsx +
// components/checkins/quick-checkin-modal.tsx), which reuses
// GoalCheckinRow directly.
export default async function CheckinHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
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
  const monthStart = parseMonthParam(month, timezone);
  const prevMonth = shiftMonth(monthStart, -1);
  const nextMonth = shiftMonth(monthStart, 1);
  const monthLabel = new Date(
    Date.UTC(
      Number(monthStart.slice(0, 4)),
      Number(monthStart.slice(5, 7)) - 1,
      1,
    ),
  ).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, category")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const monthEnd = dateInMonth(monthStart, daysInMonth(monthStart));

  let checkinsByGoal = new Map<string, Record<string, CheckinDetail>>();
  if (goals && goals.length > 0) {
    const goalIds = goals.map((g) => g.id);
    const { data: checkins } = await supabase
      .from("checkins")
      .select(
        "goal_id, checkin_date, note, calories, distance, duration_minutes, author_message",
      )
      .in("goal_id", goalIds)
      .gte("checkin_date", monthStart)
      .lte("checkin_date", monthEnd);

    checkinsByGoal = new Map(goals.map((g) => [g.id, {}]));
    for (const c of checkins ?? []) {
      const byDate = checkinsByGoal.get(c.goal_id);
      if (byDate) {
        byDate[c.checkin_date] = {
          note: c.note,
          calories: c.calories,
          distance: c.distance,
          duration_minutes: c.duration_minutes,
          author_message: c.author_message,
        };
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">
          Check-in history
        </h1>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/checkin?month=${prevMonth.slice(0, 7)}`}
            className="text-foreground underline"
          >
            &larr; Prev
          </Link>
          <span className="text-muted">{monthLabel}</span>
          <Link
            href={`/checkin?month=${nextMonth.slice(0, 7)}`}
            className="text-foreground underline"
          >
            Next &rarr;
          </Link>
        </div>
      </div>

      {!goals || goals.length === 0 ? (
        <p className="text-muted">No active goals to show history for.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {goals.map((goal) => (
            <GoalCalendar
              key={goal.id}
              goal={goal}
              monthStart={monthStart}
              checkinsByDate={checkinsByGoal.get(goal.id) ?? {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
