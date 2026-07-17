"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

type GoalSummary = {
  goalId: string;
  title: string;
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
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-900">
            {summary.fullName}
          </span>
          <span className="text-sm text-zinc-500">
            {summary.summaryPercent === null
              ? "No goals yet"
              : `${summary.summaryPercent}%`}
          </span>
        </div>
        <ProgressBar percent={summary.summaryPercent} />
      </button>

      {expanded && (
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4">
          {summary.goals.length === 0 ? (
            <p className="text-sm text-zinc-500">No goals yet.</p>
          ) : (
            summary.goals.map((goal) => (
              <div key={goal.goalId}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-zinc-700">{goal.title}</span>
                  <span className="text-zinc-500">
                    {goal.target !== null
                      ? `${goal.checkinCount} of ${goal.target} (${goal.percent}%)`
                      : "target not yet set"}
                  </span>
                </div>
                <ProgressBar percent={goal.percent} />
              </div>
            ))
          )}
          <Link
            href={`/family/${summary.userId}`}
            className="text-sm text-zinc-500 underline"
          >
            View full history
          </Link>
        </div>
      )}
    </Card>
  );
}
