import { Skeleton, SkeletonProgressRow } from "@/components/ui/skeleton";

// Mirrors app/(app)/family/[userId]/page.tsx: back link, member name, their
// goal progress rows, then the check-in history list.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <Skeleton className="mb-4 h-4 w-40" />
      <Skeleton className="mb-6 h-7 w-48" />

      <Skeleton className="mb-3 h-5 w-20" />
      <div className="mb-8 flex flex-col gap-4">
        <SkeletonProgressRow />
        <SkeletonProgressRow />
      </div>

      <Skeleton className="mb-3 h-5 w-24" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
