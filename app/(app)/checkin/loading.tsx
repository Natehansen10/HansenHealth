import { Skeleton } from "@/components/ui/skeleton";

// Mirrors app/(app)/checkin/page.tsx: title, the month stepper bar, then a
// calendar block per goal. The calendar squares are approximated by a tall
// block rather than 42 individual cells -- matching the height is what
// prevents the reflow, and a grid of shimmering squares reads as noise.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <Skeleton className="mb-3 h-7 w-56" />
      <Skeleton className="mb-6 h-11 w-full" />

      <div className="flex flex-col gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="border border-divider p-6">
            <Skeleton className="mb-4 h-4 w-32" />
            <Skeleton className="h-40 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
