import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

// Mirrors app/(app)/log/page.tsx: header, the section tab bar, then a form
// block. The tab bar is the tallest fixed element on the page, so matching
// its height is what keeps the layout from jumping.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <SkeletonPageHeader subtitle={false} />
      <Skeleton className="mb-6 h-11 w-full" />

      <Skeleton className="mb-1 h-5 w-40" />
      <Skeleton className="mb-4 h-4 w-64" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Skeleton className="mb-1 h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div>
          <Skeleton className="mb-1 h-4 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 w-28" />
    </div>
  );
}
