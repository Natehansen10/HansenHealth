"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPersonalMetric,
  setPersonalMetricActive,
  updatePersonalMetric,
  type PersonalMetricInput,
} from "@/lib/actions/health";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, NumberInput } from "@/components/ui/field";
import { PERSONAL_METRIC_FREQUENCIES } from "@/lib/utils/health";

type ManagedMetric = {
  id: string;
  name: string;
  unit: string | null;
  target_value: number | null;
  frequency: string;
  is_active: boolean;
};

const EMPTY_INPUT: PersonalMetricInput = {
  name: "",
  unit: "",
  targetValue: "",
  frequency: "daily",
};

// Shared field set for both the create form and the inline edit form -- the
// two differ only in which action they submit to, so duplicating the inputs
// would just be two places to forget a validation rule.
function MetricFields({
  value,
  onChange,
  idPrefix,
}: {
  value: PersonalMetricInput;
  onChange: (next: PersonalMetricInput) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        {(id) => (
          <input
            id={id}
            required
            maxLength={60}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="input w-full"
            placeholder="Water"
          />
        )}
      </Field>

      <Field label="Unit (optional)">
        {(id) => (
          <input
            id={id}
            maxLength={20}
            value={value.unit}
            onChange={(e) => onChange({ ...value, unit: e.target.value })}
            className="input w-full"
            placeholder="L"
          />
        )}
      </Field>

      <Field label="Target (optional)">
        {(id) => (
          <NumberInput
            id={id}
            decimal
            value={value.targetValue}
            onChange={(e) =>
              onChange({ ...value, targetValue: e.target.value })
            }
            placeholder="3"
          />
        )}
      </Field>

      <Field label="Frequency" className="sm:col-span-2">
        {(id) => (
          <select
            id={id}
            value={value.frequency}
            onChange={(e) => onChange({ ...value, frequency: e.target.value })}
            className="input w-full"
            name={`${idPrefix}-frequency`}
          >
            {PERSONAL_METRIC_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );
}

function MetricRow({ metric }: { metric: ManagedMetric }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PersonalMetricInput>({
    name: metric.name,
    unit: metric.unit ?? "",
    targetValue: metric.target_value === null ? "" : String(metric.target_value),
    frequency: metric.frequency,
  });
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  function handleSave() {
    setErrorMessage("");
    startTransition(async () => {
      const { error } = await updatePersonalMetric(metric.id, draft);
      if (error) {
        setErrorMessage(error);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleToggleActive() {
    setErrorMessage("");
    startTransition(async () => {
      const { error } = await setPersonalMetricActive(
        metric.id,
        !metric.is_active,
      );
      if (error) {
        setErrorMessage(error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className={`p-4 ${metric.is_active ? "" : "opacity-60"}`}>
      {isEditing ? (
        <div className="flex flex-col gap-3">
          <MetricFields
            value={draft}
            onChange={setDraft}
            idPrefix={`edit-${metric.id}`}
          />
          <div className="flex gap-2">
            <Button type="button" disabled={isPending} onClick={handleSave}>
              {isPending ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-medium text-foreground">{metric.name}</h3>
            <p className="text-sm text-muted">
              {metric.target_value !== null
                ? `Target ${metric.target_value}${metric.unit ? ` ${metric.unit}` : ""} · ${metric.frequency}`
                : metric.unit
                  ? `${metric.unit} · ${metric.frequency}`
                  : metric.frequency}
              {!metric.is_active && " · inactive"}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant={metric.is_active ? "danger" : "secondary"}
              disabled={isPending}
              onClick={handleToggleActive}
            >
              {metric.is_active ? "Deactivate" : "Reactivate"}
            </Button>
          </div>
        </div>
      )}

      {errorMessage && (
        <Alert tone="error" className="mt-3">
          {errorMessage}
        </Alert>
      )}
    </Card>
  );
}

// Deactivate rather than delete: a metric's entries are the point of having
// logged them, and a destructive delete would take the history with it via
// the FK cascade. Deactivating hides it from the log form while leaving the
// chart intact.
export function MetricManager({ metrics }: { metrics: ManagedMetric[] }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<PersonalMetricInput>(EMPTY_INPUT);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");

    startTransition(async () => {
      const { error } = await createPersonalMetric(draft);
      if (error) {
        setErrorMessage(error);
        return;
      }
      setDraft(EMPTY_INPUT);
      setIsCreating(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {metrics.map((metric) => (
        <MetricRow key={metric.id} metric={metric} />
      ))}

      {isCreating ? (
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 border border-divider p-4"
        >
          <MetricFields value={draft} onChange={setDraft} idPrefix="new" />
          {errorMessage && <Alert tone="error">{errorMessage}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create metric"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsCreating(false);
                setErrorMessage("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setIsCreating(true)}
          className="w-full sm:w-auto"
        >
          New metric
        </Button>
      )}
    </div>
  );
}
