"use client";

// Horizontal option switcher, used for the /log section tabs and the
// /health date-range picker. Built as a real radio group rather than a row
// of buttons so arrow keys work and screen readers announce "2 of 4" --
// visually it's a segmented bar, semantically it's a single choice.
//
// Scrolls horizontally on narrow phones instead of wrapping to a second
// line, which would push the content below it around as the label lengths
// change.
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`-mx-4 flex gap-px overflow-x-auto border-y border-divider bg-divider px-4 sm:mx-0 sm:border sm:px-0 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-11 flex-shrink-0 px-3 font-heading text-sm whitespace-nowrap transition-colors ${
              selected
                ? "bg-accent-900 font-semibold text-background"
                : "bg-background text-muted hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
