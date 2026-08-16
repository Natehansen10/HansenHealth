"use client";

// Marked client explicitly: useId() below only works in a Client
// Component, and the render-prop `children` signature can't cross a
// server/client boundary either. Both callers are already client
// components; this makes the constraint a compile error instead of a
// runtime one if that ever changes.
import { type InputHTMLAttributes, type ReactNode, useId } from "react";

// Label + control + hint wrapper. The health log forms have a lot of small
// numeric inputs, and every one of them needs a real <label for=...> tied to
// a real id -- doing that by hand at each call site is where accessibility
// quietly rots. useId() generates the pairing so callers never have to
// invent unique ids.
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  // Receives the generated id to attach to whatever control it renders.
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

// The common case: a numeric text input. type="text" with inputMode rather
// than type="number" on purpose -- type="number" on mobile Safari/Chrome
// brings scroll-wheel and spinner behaviour that eats values, and rejects
// intermediate states like "18." while someone is still typing "18.5".
// Validation happens on submit against the same bounds the DB checks.
export function NumberInput({
  decimal = false,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { decimal?: boolean }) {
  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      autoComplete="off"
      className={`input w-full ${className}`}
      {...props}
    />
  );
}
