"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { applyGoalChange } from "@/lib/actions/goals";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Goal = {
  id: string;
  title: string;
  category: string | null;
  unit: string | null;
  frequency_per_week: number;
  is_active: boolean;
};

const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7];

async function logGoalActivity(
  goalId: string,
  userId: string,
  changeSummary: string,
) {
  const supabase = createClient();
  const { error } = await supabase.from("goal_activity_log").insert({
    goal_id: goalId,
    user_id: userId,
    change_summary: changeSummary,
  });
  if (error) {
    // Best-effort: the goal edit itself already succeeded, so don't fail
    // the whole operation over a missed feed entry.
    console.error("logGoalActivity failed", error);
  }
}

export function GoalCard({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [category, setCategory] = useState(goal.category ?? "");
  const [unit, setUnit] = useState(goal.unit ?? "");
  const [frequency, setFrequency] = useState(goal.frequency_per_week);
  const [isActive, setIsActive] = useState(goal.is_active);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleFrequencyChange(newFrequency: number) {
    setSaving(true);
    setErrorMessage("");

    const oldFrequency = frequency;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("goals")
      .update({ frequency_per_week: newFrequency })
      .eq("id", goal.id);

    if (error) {
      setSaving(false);
      setErrorMessage(error.message);
      return;
    }

    // Frequency changes take effect immediately: blend this month's target
    // between the old and new frequency (server-side, via the Edge
    // Function -- month_target math never happens on the client).
    const { error: recalcError } = await applyGoalChange(
      goal.id,
      oldFrequency,
      newFrequency,
    );

    setSaving(false);

    if (recalcError) {
      setErrorMessage(recalcError);
    }

    if (user) {
      await logGoalActivity(
        goal.id,
        user.id,
        `changed "${title}" to ${newFrequency}x/week, effective immediately`,
      );
    }

    setFrequency(newFrequency);
    router.refresh();
  }

  async function handleToggleActive() {
    setSaving(true);
    setErrorMessage("");

    const nextActive = !isActive;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("goals")
      .update({ is_active: nextActive })
      .eq("id", goal.id);

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (user) {
      await logGoalActivity(
        goal.id,
        user.id,
        nextActive
          ? `reactivated "${title}"`
          : `deactivated "${title}"`,
      );
    }

    setIsActive(nextActive);
    router.refresh();
  }

  async function handleSaveDetails() {
    setSaving(true);
    setErrorMessage("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("goals")
      .update({
        title,
        category: category || null,
        unit: unit || null,
      })
      .eq("id", goal.id);

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (user) {
      const changes: string[] = [];
      if (title !== goal.title) {
        changes.push(`renamed "${goal.title}" to "${title}"`);
      }
      if ((category || null) !== goal.category) {
        changes.push(`updated the category for "${title}"`);
      }
      if ((unit || null) !== goal.unit) {
        changes.push(`updated the unit for "${title}"`);
      }
      if (changes.length > 0) {
        await logGoalActivity(goal.id, user.id, changes.join("; "));
      }
    }

    setIsEditing(false);
    router.refresh();
  }

  return (
    <Card className={isActive ? "" : "opacity-60"}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input w-full"
                placeholder="Goal title"
              />
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input w-full"
                placeholder="Category (optional)"
              />
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="input w-full"
                placeholder="Unit, e.g. Runs, Miles (optional)"
              />
            </div>
          ) : (
            <>
              <h3 className="font-medium text-foreground">{goal.title}</h3>
              {goal.category && (
                <p className="text-sm text-muted capitalize">
                  {goal.category}
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            variant={isActive ? "danger" : "secondary"}
            disabled={saving}
            onClick={handleToggleActive}
          >
            {isActive ? "Deactivate" : "Reactivate"}
          </Button>
          {isEditing ? (
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={handleSaveDetails}
            >
              Save
            </Button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-sm text-muted underline"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor={`frequency-${goal.id}`}
          className="mb-1 block text-sm text-muted"
        >
          Times per week
        </label>
        <select
          id={`frequency-${goal.id}`}
          value={frequency}
          disabled={saving}
          onChange={(e) => handleFrequencyChange(Number(e.target.value))}
          className="input w-full max-w-[120px] disabled:opacity-50"
        >
          {FREQUENCIES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Changes take effect immediately.
        </p>
      </div>

      {errorMessage && (
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
      )}
    </Card>
  );
}
