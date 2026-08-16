import {
  Skeleton,
  SkeletonCard,
  SkeletonChart,
  SkeletonPageHeader,
} from "@/components/ui/skeleton";

// Mirrors app/(app)/health/page.tsx: header, range picker, a two-column
// trend grid, then the metrics list. The shapes match the real content so
// the page doesn't reflow when data arrives.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <SkeletonPageHeader />
      <Skeleton className="mb-6 h-11 w-full" />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
        <SkeletonChart />
        <SkeletonChart />
      </div>

      <Skeleton className="mb-3 h-5 w-32" />
      <div className="flex flex-col gap-3">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </div>
    </div>
  );
}
