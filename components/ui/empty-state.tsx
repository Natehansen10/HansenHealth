import { type ReactNode } from "react";
import { BlueprintCorners } from "./blueprint-corners";

// The shared "nothing here yet" block. Every list/feed view in the app uses
// this instead of a bare <p className="text-muted">No X yet.</p> so that an
// empty screen still reads as a designed state with an obvious next action,
// not as a page that failed to load.
//
// `action` is the thing to do about it (usually a <Link><Button/></Link>).
// Omit it only when the user genuinely can't act -- e.g. prize history,
// which fills in on its own at month end.
export function EmptyState({
  title,
  description,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`blueprint flex flex-col items-center border border-dashed border-divider px-6 py-10 text-center ${className}`}
    >
      <BlueprintCorners />
      <p className="font-heading text-base font-semibold text-foreground">
        {title}
      </p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
