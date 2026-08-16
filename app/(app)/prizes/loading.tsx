import {
  Skeleton,
  SkeletonCard,
  SkeletonProgressRow,
} from "@/components/ui/skeleton";

// Mirrors app/(app)/prizes/page.tsx: standings (progress rows) above prize
// history (plain cards).
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <Skeleton className="mb-6 h-7 w-24" />

      <Skeleton className="mb-3 h-5 w-48" />
      <div className="mb-8 flex flex-col gap-3">
        <SkeletonProgressRow />
        <SkeletonProgressRow />
      </div>

      <Skeleton className="mb-3 h-5 w-32" />
      <div className="flex flex-col gap-3">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </div>
    </div>
  );
}
