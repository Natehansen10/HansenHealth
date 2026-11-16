"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/app/actions";
import { Alert, buttonClass, inputClass, secondaryButtonClass } from "./ui";

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type ButtonAction = (prev: ActionState) => Promise<ActionState>;

// Clears a form after a successful save, so the next entry starts fresh.
function useResetOnSuccess(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function CheckinForm({
  action,
  goals,
  today,
}: {
  action: FormAction;
  goals: { id: string; title: string }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useResetOnSuccess(state);

  return (
    <form ref={ref} action={formAction} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Goal</span>
        <select name="goal_id" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Choose a goal
          </option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Date</span>
        <input
          type="date"
          name="checkin_date"
          required
          max={today}
          defaultValue={today}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">
          Minutes <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          type="number"
          name="duration_minutes"
          min={1}
          max={1440}
          inputMode="numeric"
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">
          Note <span className="font-normal text-muted">(optional)</span>
        </span>
        <input type="text" name="note" maxLength={280} className={inputClass} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Log check-in"}
        </button>
        {state && <Alert ok={state.ok}>{state.message}</Alert>}
      </div>
    </form>
  );
}

export function GoalForm({ action }: { action: FormAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useResetOnSuccess(state);

  return (
    <form ref={ref} action={formAction} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Goal</span>
        <input
          type="text"
          name="title"
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Stretch after work"
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Times per week</span>
        <select name="frequency_per_week" defaultValue="3" className={inputClass}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Category</span>
        <select name="category" defaultValue="Fitness" className={inputClass}>
          <option>Fitness</option>
          <option>Nutrition</option>
          <option>Mindfulness</option>
          <option>Sleep</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">
          Unit <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          type="text"
          name="unit"
          maxLength={30}
          placeholder="sessions, walks, days"
          className={inputClass}
        />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Adding…" : "Add goal"}
        </button>
        {state && <Alert ok={state.ok}>{state.message}</Alert>}
      </div>
    </form>
  );
}

// A single-button form (delete, pause, award). Shows its own error inline.
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirm,
  primary = false,
}: {
  action: ButtonAction;
  label: string;
  pendingLabel: string;
  confirm?: string;
  primary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-2"
    >
      <button
        type="submit"
        disabled={pending}
        className={primary ? buttonClass : secondaryButtonClass}
      >
        {pending ? pendingLabel : label}
      </button>
      {state && !state.ok && <Alert ok={false}>{state.message}</Alert>}
      {state && state.ok && primary && <Alert ok>{state.message}</Alert>}
    </form>
  );
}
