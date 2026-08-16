"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHealthLog } from "@/lib/actions/health";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, NumberInput } from "@/components/ui/field";
import {
  metricsInGroup,
  parseMetricInput,
  SLEEP_QUALITY_LABELS,
  type HealthMetricGroup,
  type HealthMetricKey,
} from "@/lib/utils/health";

type InitialValues = Partial<Record<HealthMetricKey, number | null>>;

// One section of the unified log (Body / Vitals / Sleep / Activity). Each
// section saves independently and sends ONLY its own metric keys, which is
// what lets saveHealthLog leave the other sections' values untouched --
// see the HealthLogInput contract in lib/actions/health.ts.
export function HealthLogForm({
  group,
  weightUnit,
  initial,
}: {
  group: HealthMetricGroup;
  weightUnit: string;
  initial: InitialValues;
}) {
  const router = useRouter();
  const metrics = metricsInGroup(group);

  // Seeded from server-provided props, never from a browser-only read --
  // the hydration-mismatch rule in CLAUDE.md.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      metrics.map((m) => {
        const existing = initial[m.key];
        return [m.key, existing === null || existing === undefined ? "" : String(existing)];
      }),
    ),
  );

  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Any edit invalidates the previous "Saved" confirmation -- leaving it
    // up while the user types new numbers claims something untrue.
    setStatus("idle");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setErrorMessage("");

    // Validate client-side first so the user gets the message next to the
    // field instead of a round trip. The Server Action re-validates with
    // the same helper -- this is convenience, not the check that counts.
    for (const def of metrics) {
      const parsed = parseMetricInput(values[def.key] ?? "", def);
      if (!parsed.ok) {
        setStatus("error");
        setErrorMessage(parsed.error);
        return;
      }
    }

    startTransition(async () => {
      const { error } = await saveHealthLog({
        values: Object.fromEntries(
          metrics.map((m) => [m.key, values[m.key] ?? ""]),
        ) as Partial<Record<HealthMetricKey, string>>,
      });

      if (error) {
        setStatus("error");
        setErrorMessage(error);
        return;
      }

      setStatus("saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {metrics.map((def) =>
          def.key === "sleep_quality" ? (
            // A 1-5 rating is a choice, not a number to type. Rendering it
            // as five big targets removes the keyboard entirely on mobile,
            // where this form mostly gets used.
            <fieldset key={def.key} className="sm:col-span-2">
              <legend className="mb-1 block text-sm text-muted">
                {def.label}
              </legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((rating) => {
                  const selected = values[def.key] === String(rating);
                  return (
                    <button
                      key={rating}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        // Tapping the selected rating clears it, which is
                        // the only way to un-answer an optional question
                        // once answered.
                        setValue(def.key, selected ? "" : String(rating))
                      }
                      className={`min-h-11 flex-1 border px-2 text-sm transition-colors ${
                        selected
                          ? "border-accent-900 bg-accent-900 font-semibold text-background"
                          : "border-divider text-muted hover:text-foreground"
                      }`}
                    >
                      <span className="block font-heading">{rating}</span>
                      <span className="block text-[10px] leading-tight">
                        {SLEEP_QUALITY_LABELS[rating]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <Field
              key={def.key}
              label={
                def.key === "weight"
                  ? `${def.label} (${weightUnit})`
                  : def.unit
                    ? `${def.label} (${def.unit})`
                    : def.label
              }
            >
              {(id) => (
                <NumberInput
                  id={id}
                  decimal={def.decimal}
                  value={values[def.key] ?? ""}
                  onChange={(e) => setValue(def.key, e.target.value)}
                  placeholder={def.placeholder}
                />
              )}
            </Field>
          ),
        )}
      </div>

      <p className="text-xs text-muted">
        Leave a field blank to skip it. Clearing a saved value removes it.
      </p>

      {status === "error" && <Alert tone="error">{errorMessage}</Alert>}
      {status === "saved" && (
        <Alert tone="success">Saved to today&rsquo;s log.</Alert>
      )}

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
