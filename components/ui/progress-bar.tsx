export function ProgressBar({ percent }: { percent: number | null }) {
  const value = percent ?? 0;

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-full rounded-full bg-zinc-900 transition-all"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
