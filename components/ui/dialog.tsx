"use client";

import { useEffect } from "react";
import { BlueprintCorners } from "./blueprint-corners";

// Minimal shared dialog: fixed-position backdrop + centered panel, no
// portal/animation library. Closable via the X button, a backdrop click, or
// Escape. Used by the dashboard quick-checkin modal and the onboarding
// popups (notification-permission, app-explainer) -- keep this the single
// shared implementation rather than three ad-hoc ones.
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="blueprint relative max-h-[85vh] w-full max-w-md overflow-y-auto border border-divider bg-background p-6 shadow-lg"
      >
        <BlueprintCorners />
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-muted hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
