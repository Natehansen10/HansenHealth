"use client";

import { useState, useTransition } from "react";
import { updateNotificationPreferences } from "@/lib/actions/notifications";

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-zinc-900">
          {label}
        </span>
        <span className="block text-sm text-zinc-500">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-zinc-200 transition-colors checked:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 relative before:absolute before:left-0.5 before:top-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4"
      />
    </label>
  );
}

export function NotificationPreferencesForm({
  initialPushEnabled,
  initialEmailEnabled,
}: {
  initialPushEnabled: boolean;
  initialEmailEnabled: boolean;
}) {
  const [pushEnabled, setPushEnabled] = useState(initialPushEnabled);
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  function handleChange(
    field: "push_enabled" | "email_enabled",
    next: boolean,
  ) {
    setErrorMessage("");

    const previousPush = pushEnabled;
    const previousEmail = emailEnabled;

    if (field === "push_enabled") {
      setPushEnabled(next);
    } else {
      setEmailEnabled(next);
    }

    startTransition(async () => {
      const { error } = await updateNotificationPreferences({
        [field]: next,
      });

      if (error) {
        setErrorMessage(error);
        // Revert the optimistic update on failure.
        setPushEnabled(previousPush);
        setEmailEnabled(previousEmail);
      }
    });
  }

  return (
    <div className="divide-y divide-zinc-100">
      <ToggleRow
        label="Push notifications"
        description="Get notified on this device for family activity."
        checked={pushEnabled}
        disabled={isPending}
        onChange={(next) => handleChange("push_enabled", next)}
      />
      <ToggleRow
        label="Email notifications"
        description="Get emailed for family activity."
        checked={emailEnabled}
        disabled={isPending}
        onChange={(next) => handleChange("email_enabled", next)}
      />
      {errorMessage && (
        <p className="pt-3 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
