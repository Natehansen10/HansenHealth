export type GoalProgress = {
  goalId: string;
  checkinCount: number;
  target: number | null;
  // Optional display label for the countable thing (e.g. "Runs", "Miles").
  // Purely cosmetic -- goalPercent/aggregatePercent never read this field,
  // so adding it here doesn't change the math monthly-prize-calculation
  // shares with the dashboard.
  unit?: string | null;
};

// Formats "checkinCount of target" using the goal's unit label, falling
// back to generic phrasing when no unit was set at goal-creation time.
export function progressLabel(progress: GoalProgress): string {
  const unit = progress.unit?.trim() || "check-ins";
  if (progress.target === null) {
    return `${progress.checkinCount} ${unit}`;
  }
  return `${progress.checkinCount}/${progress.target} ${unit}`;
}

// Per-goal percent, capped at 100. A goal with no target yet (snapshot not
// run) contributes null and is excluded from the aggregate below.
export function goalPercent(progress: GoalProgress): number | null {
  if (progress.target === null || progress.target <= 0) return null;
  return Math.min(100, Math.round((progress.checkinCount / progress.target) * 100));
}

// Aggregate summary percent: average of each active goal's capped percent.
// Shared by the dashboard summary bar and monthly-prize-calculation (Phase
// 6) so both agree on what "100%" means -- do not reimplement separately.
export function aggregatePercent(goals: GoalProgress[]): number | null {
  const percents = goals
    .map(goalPercent)
    .filter((p): p is number => p !== null);

  if (percents.length === 0) return null;

  const sum = percents.reduce((total, p) => total + p, 0);
  return Math.round(sum / percents.length);
}
