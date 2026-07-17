export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-col gap-3">
        <div className="h-6 w-40 animate-pulse bg-neutral-200" />
        <div className="h-24 animate-pulse border border-divider bg-neutral-100" />
        <div className="h-24 animate-pulse border border-divider bg-neutral-100" />
        <div className="h-24 animate-pulse border border-divider bg-neutral-100" />
      </div>
    </div>
  );
}
