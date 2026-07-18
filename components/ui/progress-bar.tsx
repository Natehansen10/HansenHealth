export function ProgressBar({
  percent,
  label,
}: {
  percent: number | null;
  label?: string;
}) {
  const value = percent ?? 0;

  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>{label}</span>
          <span>{percent === null ? "--" : `${percent}%`}</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden border border-divider bg-neutral-100">
        <div
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-full bg-accent-900 transition-all"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}
