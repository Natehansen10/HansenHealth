// Loading placeholders. Skeletons over spinners wherever the incoming
// content has a known shape -- the point is that the page doesn't jump when
// real data arrives, so a skeleton should approximate the real thing's
// height and rhythm rather than being a generic grey box.
//
// aria-hidden throughout: the surrounding route-level loading.tsx is what
// screen readers should announce (Next marks the Suspense boundary busy),
// not a pile of decorative rectangles.

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-neutral-200 ${className}`}
    />
  );
}

// A card-shaped block matching <Card>'s hairline border + p-6 footprint.
export function SkeletonCard({
  lines = 2,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`border border-divider p-6 ${className}`}
    >
      <Skeleton className="mb-3 h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"} ${i > 0 ? "mt-2" : ""}`}
        />
      ))}
    </div>
  );
}

// Matches the header block every route renders: title, optional subtitle.
export function SkeletonPageHeader({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div aria-hidden="true" className="mb-6">
      <Skeleton className="h-7 w-48" />
      {subtitle && <Skeleton className="mt-2 h-4 w-64" />}
    </div>
  );
}

// Matches <Card> + <ProgressBar>, the dashboard/prizes summary row shape.
export function SkeletonProgressRow() {
  return (
    <div aria-hidden="true" className="border border-divider p-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-10" />
      </div>
      <Skeleton className="h-2 w-full" />
    </div>
  );
}

// Matches the chart cards on /health: title, big value, plot area.
export function SkeletonChart() {
  return (
    <div aria-hidden="true" className="border border-divider p-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-7 w-20" />
      <Skeleton className="mt-4 h-24 w-full" />
    </div>
  );
}
