import { type ReactNode } from "react";

type AlertTone = "error" | "warning" | "info" | "success";

// Inline status banner for failed mutations, degraded realtime, and similar
// "something you should know about the thing you just did" messages.
// Deliberately not a toast: this app has no toast host, and an inline
// element next to the control that failed is easier to reach on a phone
// than a message that times out in a corner.
//
// role is chosen by tone: errors announce assertively (they interrupt),
// everything else is polite. Both are live regions, so a message that
// appears after a failed save is read out without moving focus.
const toneClasses: Record<AlertTone, string> = {
  error: "border-red-300 bg-red-50 text-red-800",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-divider bg-surface text-foreground",
  success: "border-success-500/40 bg-success-100 text-foreground",
};

export function Alert({
  tone = "error",
  title,
  children,
  action,
  className = "",
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`flex flex-col gap-2 border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${toneClasses[tone]} ${className}`}
    >
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="[overflow-wrap:anywhere]">{children}</div>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
