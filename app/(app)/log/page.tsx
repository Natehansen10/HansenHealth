import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getQuickCheckinData } from "@/lib/data/checkin-status";
import { getHealthLogFormData } from "@/lib/data/health";
import { formatShortDate } from "@/lib/utils/health";
import { GoalCheckinRow } from "@/components/checkins/goal-checkin-row";
import { HealthLogForm } from "@/components/health/health-log-form";
import { LogTabs, type LogSection } from "@/components/health/log-tabs";
import { PersonalMetricLog } from "@/components/health/personal-metric-log";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// The unified log entry point: everything a user might want to record today
// lives behind one nav item instead of being spread across /checkin, a
// dashboard modal, and (previously nowhere) the health metrics. This
// replaced the dashboard's quick-checkin modal -- the check-in section here
// reuses the same GoalCheckinRow with the same data, so nothing was lost.
export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
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

  const [checkinData, healthData] = await Promise.all([
    getQuickCheckinData(user.id, timezone),
    getHealthLogFormData(user.id, timezone),
  ]);

  const log = healthData.todayLog;

  const sections: LogSection[] = [
    {
      id: "checkin",
      label: "Check in",
      heading: "Goal check-ins",
      description:
        "Family-visible. Everyone sees these and can react and comment.",
      content:
        checkinData.goals.length === 0 ? (
          <EmptyState
            title="No active goals"
            description="Goal check-ins are the family side of the app. Create a goal to start checking in."
            action={
              <Link href="/goals/new">
                <Button type="button">Create a goal</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {checkinData.goals.map((goal) => (
              <GoalCheckinRow
                key={goal.id}
                goal={goal}
                today={checkinData.today}
                target={checkinData.targetByGoal.get(goal.id) ?? null}
                monthCount={checkinData.countByGoal.get(goal.id) ?? 0}
                todayCheckin={
                  checkinData.todayCheckinByGoal.get(goal.id) ?? null
                }
              />
            ))}
          </div>
        ),
    },
    {
      id: "body",
      label: "Body",
      heading: "Body metrics",
      description: "Private to you unless you turn on sharing in Settings.",
      content: (
        <HealthLogForm
          group="body"
          weightUnit={healthData.weightUnit}
          initial={{
            weight: log?.weight ?? null,
            body_fat_percent: log?.body_fat_percent ?? null,
          }}
        />
      ),
    },
    {
      id: "vitals",
      label: "Vitals",
      heading: "Vitals",
      description: "Private to you unless you turn on sharing in Settings.",
      content: (
        <HealthLogForm
          group="vitals"
          weightUnit={healthData.weightUnit}
          initial={{
            systolic: log?.systolic ?? null,
            diastolic: log?.diastolic ?? null,
            resting_heart_rate: log?.resting_heart_rate ?? null,
          }}
        />
      ),
    },
    {
      id: "sleep",
      label: "Sleep",
      heading: "Sleep",
      description: "Private to you unless you turn on sharing in Settings.",
      content: (
        <HealthLogForm
          group="sleep"
          weightUnit={healthData.weightUnit}
          initial={{
            sleep_hours: log?.sleep_hours ?? null,
            sleep_quality: log?.sleep_quality ?? null,
          }}
        />
      ),
    },
    {
      id: "activity",
      label: "Activity",
      heading: "Daily activity",
      description: "Private to you unless you turn on sharing in Settings.",
      content: (
        <HealthLogForm
          group="activity"
          weightUnit={healthData.weightUnit}
          initial={{ steps: log?.steps ?? null }}
        />
      ),
    },
    {
      id: "custom",
      label: "Custom",
      heading: "Your metrics",
      description: "Private to you unless you turn on sharing in Settings.",
      content: <PersonalMetricLog metrics={healthData.metrics} />,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
          Log
        </h1>
        <p className="text-sm text-muted">
          {formatShortDate(healthData.today)}
        </p>
      </div>

      <LogTabs sections={sections} initialSection={section ?? "checkin"} />
    </div>
  );
}
