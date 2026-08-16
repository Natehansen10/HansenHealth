import {
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
  SkeletonProgressRow,
} from "@/components/ui/skeleton";

// Fallback for any (app) segment without its own loading.tsx, and the
// dashboard's own -- so it mirrors the dashboard: header, the "Log today"
// CTA, the family progress rows, then the activity feed.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <SkeletonPageHeader />
      <Skeleton className="mb-6 h-10 w-full" />

      <div className="mb-8 flex flex-col gap-3">
        <SkeletonProgressRow />
        <SkeletonProgressRow />
        <SkeletonProgressRow />
      </div>

      <Skeleton className="mb-3 h-5 w-36" />
      <div className="flex flex-col gap-4">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}
