"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { progressLabel } from "@/lib/utils/progress";

type GoalSummary = {
  goalId: string;
  title: string;
  unit: string | null;
  checkinCount: number;
  target: number | null;
  percent: number | null;
};

type MemberSummary = {
  userId: string;
  fullName: string;
  summaryPercent: number | null;
  goals: GoalSummary[];
};

export function FamilySummaryBar({ summary }: { summary: MemberSummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-2 text-left"
      >
        <div className="flex w-full items-center justify-between gap-3">
          <span className="font-medium text-foreground">
            {summary.fullName}
          </span>
          <div className="flex flex-shrink-0 items-center gap-2">
            <span className="text-sm text-muted">
              {summary.summaryPercent === null
                ? "No goals yet"
                : `${summary.summaryPercent}%`}
            </span>
            {summary.goals.length > 0 && (
              <span
                aria-hidden="true"
                className="font-heading text-sm text-muted"
              >
                {expanded ? "−" : "+"}
              </span>
            )}
          </div>
        </div>
        <ProgressBar percent={summary.summaryPercent} />
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-3 border-t border-divider pt-4">
          {summary.goals.length === 0 ? (
            <p className="text-sm text-muted">No goals yet.</p>
          ) : (
            summary.goals.map((goal) => (
              <ProgressBar
                key={goal.goalId}
                percent={goal.percent}
                label={`${goal.title} — ${progressLabel({
                  goalId: goal.goalId,
                  checkinCount: goal.checkinCount,
                  target: goal.target,
                  unit: goal.unit,
                })}`}
              />
            ))
          )}
          <Link
            href={`/family/${summary.userId}`}
            className="text-sm text-muted underline"
          >
            View full history
          </Link>
        </div>
      )}
    </Card>
  );
}
