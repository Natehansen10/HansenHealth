"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHealthVisibility, setWeightUnit } from "@/lib/actions/health";
import { Alert } from "@/components/ui/alert";

// Two controls, saved immediately on change rather than behind a Save
// button: both are single-choice toggles where the effect is visible right
// away, and an unsaved "shared with family" radio is exactly the kind of
// ambiguity that shouldn't exist on a privacy control.
//
// Optimistic-ish: the radio reflects the click straight away and rolls back
// if the action fails, so a failed save can't leave the UI claiming a
// sharing state the database doesn't have.
export function HealthPrivacyForm({
  initialVisibility,
  initialWeightUnit,
}: {
  initialVisibility: string;
  initialWeightUnit: string;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(initialVisibility);
  const [unit, setUnit] = useState(initialWeightUnit);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  function handleVisibility(next: string) {
    const previous = visibility;
    setVisibility(next);
    setErrorMessage("");

    startTransition(async () => {
      const { error } = await setHealthVisibility(next);
      if (error) {
        setVisibility(previous);
        setErrorMessage(error);
        return;
      }
      router.refresh();
    });
  }

  function handleUnit(next: string) {
    const previous = unit;
    setUnit(next);
    setErrorMessage("");

    startTransition(async () => {
      const { error } = await setWeightUnit(next);
      if (error) {
        setUnit(previous);
        setErrorMessage(error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <fieldset disabled={isPending} className="mb-4">
        <legend className="mb-2 text-sm text-muted">
          Who can see your health log
        </legend>
        <div className="flex flex-col gap-2">
          {[
            {
              value: "private",
              label: "Only me",
              hint: "Nobody else in your family can see any of it.",
            },
            {
              value: "family",
              label: "My family",
              hint: "Everyone in your family can view your metrics and trends. They still can't edit or delete anything.",
            },
          ].map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 border p-3 ${
                visibility === option.value
                  ? "border-accent-900"
                  : "border-divider"
              }`}
            >
              <input
                type="radio"
                name="health-visibility"
                value={option.value}
                checked={visibility === option.value}
                onChange={() => handleVisibility(option.value)}
                className="mt-1 flex-shrink-0"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {option.label}
                </span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={isPending}>
        <legend className="mb-2 text-sm text-muted">Weight unit</legend>
        <div className="flex gap-2">
          {["lb", "kg"].map((option) => (
            <label
              key={option}
              className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 border text-sm ${
                unit === option
                  ? "border-accent-900 font-medium text-foreground"
                  : "border-divider text-muted"
              }`}
            >
              <input
                type="radio"
                name="weight-unit"
                value={option}
                checked={unit === option}
                onChange={() => handleUnit(option)}
                className="sr-only"
              />
              {option}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          A label only — switching this relabels your charts and does not
          convert any weight you have already logged.
        </p>
      </fieldset>

      {errorMessage && (
        <Alert tone="error" className="mt-3">
          {errorMessage}
        </Alert>
      )}
    </div>
  );
}
