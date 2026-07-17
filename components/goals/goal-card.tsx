"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Goal = {
  id: string;
  title: string;
  category: string | null;
  frequency_per_week: number;
  is_active: boolean;
};

const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7];

export function GoalCard({ goal }: { goal: Goal }) {
  const router = useRouter();
  const [frequency, setFrequency] = useState(goal.frequency_per_week);
  const [isActive, setIsActive] = useState(goal.is_active);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleFrequencyChange(newFrequency: number) {
    setSaving(true);
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase
      .from("goals")
      .update({ frequency_per_week: newFrequency })
      .eq("id", goal.id);

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setFrequency(newFrequency);
    router.refresh();
  }

  async function handleToggleActive() {
    setSaving(true);
    setErrorMessage("");

    const nextActive = !isActive;
    const supabase = createClient();
    const { error } = await supabase
      .from("goals")
      .update({ is_active: nextActive })
      .eq("id", goal.id);

    setSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setIsActive(nextActive);
    router.refresh();
  }

  return (
    <Card className={isActive ? "" : "opacity-60"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-foreground">{goal.title}</h3>
          {goal.category && (
            <p className="text-sm text-muted capitalize">{goal.category}</p>
          )}
        </div>
        <Button
          type="button"
          variant={isActive ? "danger" : "secondary"}
          disabled={saving}
          onClick={handleToggleActive}
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </Button>
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
          Changes apply starting next month.
        </p>
      </div>

      {errorMessage && (
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
      )}
    </Card>
  );
}
