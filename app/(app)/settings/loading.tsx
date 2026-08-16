import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

// Mirrors app/(app)/settings/page.tsx: max-w-lg (not 2xl) and a stack of
// setting cards.
export default function Loading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-8">
      <Skeleton className="mb-6 h-7 w-28" />
      <div className="flex flex-col gap-6">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={4} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}
