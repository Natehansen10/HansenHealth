import Link from "next/link";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-divider bg-surface p-4 shadow-sm sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

// "Nothing here" block. Says what's missing and, where there is one, what to do.
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-divider px-6 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <p
      role={ok ? "status" : "alert"}
      aria-live={ok ? "polite" : "assertive"}
      className={`rounded-md border px-3 py-2 text-sm ${
        ok
          ? "border-success-500/40 bg-success-100 text-success-700"
          : "border-red-300 bg-red-50 text-red-800"
      }`}
    >
      {children}
    </p>
  );
}

export function ProgressBar({ value }: { value: number | null }) {
  const width = Math.max(0, Math.min(100, value ?? 0));
  const done = (value ?? 0) >= 100;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-neutral-200"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <div
        className={`h-full rounded-full ${done ? "bg-success-500" : "bg-accent-600"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-accent-800 px-4 py-2 text-sm font-medium text-white hover:bg-accent-900 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-divider bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60";

export const inputClass =
  "w-full rounded-md border border-divider bg-white px-3 py-2 text-sm focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-200";

// Pill-style link list, used for family and month pickers.
export function PillNav({
  items,
  label,
}: {
  items: { href: string; label: string; active: boolean }[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${
            item.active
              ? "border-accent-800 bg-accent-800 text-white"
              : "border-divider bg-surface text-foreground hover:bg-neutral-100"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
