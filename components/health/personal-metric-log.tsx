"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logPersonalMetricEntry } from "@/lib/actions/health";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberInput } from "@/components/ui/field";

type LoggableMetric = {
  id: string;
  name: string;
  unit: string | null;
  target_value: number | null;
  frequency: string;
  todayValue: number | null;
};

// Quick-log row for one user-defined metric. Each row saves on its own so a
// slow save on one metric never blocks entering another -- the per-row
// pending/error state is deliberately local rather than shared across the
// list.
function MetricRow({ metric }: { metric: LoggableMetric }) {
  const router = useRouter();
  const [value, setValue] = useState(
    metric.todayValue === null ? "" : String(metric.todayValue),
  );
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const dirty = value !== (metric.todayValue === null ? "" : String(metric.todayValue));

  function handleSave() {
    setStatus("idle");
    setErrorMessage("");

    startTransition(async () => {
      const { error } = await logPersonalMetricEntry(metric.id, value);
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
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-medium text-foreground">{metric.name}</h3>
        <span className="text-xs text-muted">
          {metric.target_value !== null
            ? `Target ${metric.target_value}${metric.unit ? ` ${metric.unit}` : ""} ${metric.frequency}`
            : metric.frequency}
        </span>
      </div>

      <div className="mt-2 flex items-stretch gap-2">
        <div className="flex flex-1 items-center gap-2">
          <NumberInput
            decimal
            aria-label={`${metric.name} value for today`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setStatus("idle");
            }}
            placeholder={metric.unit ?? "Value"}
          />
          {metric.unit && (
            <span className="flex-shrink-0 text-sm text-muted">
              {metric.unit}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant={dirty ? "primary" : "secondary"}
          disabled={isPending || !dirty}
          onClick={handleSave}
        >
          {isPending ? "..." : "Save"}
        </Button>
      </div>

      {status === "error" && (
        <Alert tone="error" className="mt-2">
          {errorMessage}
        </Alert>
      )}
      {status === "saved" && (
        <p className="mt-2 text-xs text-muted">
          {value.trim() === "" ? "Cleared." : "Saved."}
        </p>
      )}
    </Card>
  );
}

export function PersonalMetricLog({ metrics }: { metrics: LoggableMetric[] }) {
  if (metrics.length === 0) {
    return (
      <EmptyState
        title="No personal metrics yet"
        description="Track anything the built-in metrics don't cover — water, meditation minutes, migraines, whatever matters to you."
        action={
          <Link href="/health">
            <Button type="button">Create a metric</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {metrics.map((metric) => (
        <MetricRow key={metric.id} metric={metric} />
      ))}
    </div>
  );
}
