"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { daysInMonth, dateInMonth, firstWeekdayOfMonth } from "@/lib/utils/dates";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export type CheckinDetail = {
  note: string | null;
  calories: number | null;
  distance: number | null;
  duration_minutes: number | null;
  author_message: string | null;
};

export function GoalCalendar({
  goal,
  monthStart,
  checkinsByDate,
}: {
  goal: { id: string; title: string; category: string | null };
  monthStart: string;
  checkinsByDate: Record<string, CheckinDetail>;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const total = daysInMonth(monthStart);
  const leadingBlanks = firstWeekdayOfMonth(monthStart);
  const days = Array.from({ length: total }, (_, i) => i + 1);

  const selected = selectedDate ? checkinsByDate[selectedDate] : undefined;

  return (
    <Card>
      <h3 className="font-medium text-foreground">{goal.title}</h3>
      {goal.category && (
        <p className="text-sm text-muted capitalize">{goal.category}</p>
      )}
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-xs text-muted"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((day) => {
          const date = dateInMonth(monthStart, day);
          const completed = date in checkinsByDate;
          const isSelected = selectedDate === date;

          return (
            <button
              key={date}
              type="button"
              title={date}
              onClick={() =>
                setSelectedDate((current) => (current === date ? null : date))
              }
              className={`flex aspect-square items-center justify-center border text-xs transition-colors ${
                completed
                  ? "border-success-500 bg-success-100 text-success-500"
                  : "border-divider text-muted"
              } ${isSelected ? "ring-2 ring-accent-900" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-3 border border-divider bg-surface p-3 text-sm">
          <div className="mb-1 font-medium text-foreground">
            {selectedDate}
          </div>
          {selected ? (
            <div className="flex flex-col gap-1 text-foreground">
              {selected.author_message && (
                <p className="italic">&ldquo;{selected.author_message}&rdquo;</p>
              )}
              {selected.note && <p>{selected.note}</p>}
              {(selected.calories !== null ||
                selected.distance !== null ||
                selected.duration_minutes !== null) && (
                <p className="text-xs text-muted">
                  {[
                    selected.calories !== null && `${selected.calories} cal`,
                    selected.distance !== null &&
                      `${selected.distance} distance`,
                    selected.duration_minutes !== null &&
                      `${selected.duration_minutes} min`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {!selected.author_message &&
                !selected.note &&
                selected.calories === null &&
                selected.distance === null &&
                selected.duration_minutes === null && (
                  <p className="text-muted">Checked in, no details added.</p>
                )}
            </div>
          ) : (
            <p className="text-muted">No check-in that day.</p>
          )}
        </div>
      )}
    </Card>
  );
}
