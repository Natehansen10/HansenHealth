"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GoalCheckinRow } from "@/components/checkins/goal-checkin-row";

type Goal = {
  id: string;
  title: string;
  category: string | null;
};

type TodayCheckin = {
  id: string;
  goal_id: string;
  note: string | null;
  calories: number | null;
  distance: number | null;
  duration_minutes: number | null;
  author_message: string | null;
  created_at: string;
};

export function QuickCheckinModal({
  today,
  goals,
  targetByGoal,
  countByGoal,
  todayCheckinByGoal,
}: {
  today: string;
  goals: Goal[];
  targetByGoal: Record<string, number | null>;
  countByGoal: Record<string, number>;
  todayCheckinByGoal: Record<string, TodayCheckin>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="mb-6 w-full">
        Check in now
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Check in">
        {goals.length === 0 ? (
          <p className="text-muted">No active goals to check in on yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {goals.map((goal) => (
              <GoalCheckinRow
                key={goal.id}
                goal={goal}
                today={today}
                target={targetByGoal[goal.id] ?? null}
                monthCount={countByGoal[goal.id] ?? 0}
                todayCheckin={todayCheckinByGoal[goal.id] ?? null}
                onCheckedIn={() => router.refresh()}
              />
            ))}
          </div>
        )}
      </Dialog>
    </>
  );
}
