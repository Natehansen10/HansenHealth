"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { HEALTH_RANGES } from "@/lib/utils/health";

// Pushes the selected window into the URL rather than holding it in state,
// so the range survives a refresh and can be linked to. The page re-fetches
// server-side on navigation; useTransition keeps the old chart on screen
// (dimmed) instead of flashing the route-level skeleton for what is usually
// a very fast query.
export function RangePicker({ value }: { value: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className={isPending ? "opacity-60 transition-opacity" : ""}>
      <SegmentedControl
        label="Time range"
        value={value}
        options={HEALTH_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        onChange={(next) => {
          startTransition(() => {
            router.push(`/health?range=${next}`, { scroll: false });
          });
        }}
      />
    </div>
  );
}
