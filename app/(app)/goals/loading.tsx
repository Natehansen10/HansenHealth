import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

// Mirrors app/(app)/goals/page.tsx: title beside a "New goal" button, then
// a column of goal cards (each of which carries a title, category line and
// a frequency control -- hence three lines).
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>

      <div className="flex flex-col gap-4">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
