"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Goal = {
  id: string;
  title: string;
  category: string | null;
};

type TodayCheckin = {
  id: string;
  goal_id: string;
  note: string | null;
  calories: number | null;
  distance: number | null;
  duration_minutes: number | null;
  author_message: string | null;
  created_at: string;
} | null;

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isWithinEditWindow(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function GoalCheckinRow({
  goal,
  today,
  target,
  monthCount,
  todayCheckin,
  onCheckedIn,
}: {
  goal: Goal;
  today: string;
  target: number | null;
  monthCount: number;
  todayCheckin: TodayCheckin;
  onCheckedIn?: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [calories, setCalories] = useState("");
  const [distance, setDistance] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [authorMessage, setAuthorMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const [editingNote, setEditingNote] = useState(todayCheckin?.note ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const percent =
    target && target > 0 ? Math.round((monthCount / target) * 100) : null;
  const editable = todayCheckin ? isWithinEditWindow(todayCheckin.created_at) : false;

  async function handleCheckIn() {
    setStatus("saving");
    setErrorMessage("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus("error");
      setErrorMessage("Your session expired. Please sign in again.");
      return;
    }

    const { error } = await supabase.from("checkins").insert({
      goal_id: goal.id,
      user_id: user.id,
      checkin_date: today,
      note: note || null,
      calories: toNullableNumber(calories),
      distance: toNullableNumber(distance),
      duration_minutes: toNullableNumber(durationMinutes),
      author_message: authorMessage || null,
    });

    setStatus("idle");

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setNote("");
    setCalories("");
    setDistance("");
    setDurationMinutes("");
    setAuthorMessage("");
    setShowDetails(false);
    onCheckedIn?.();
    router.refresh();
  }

  async function handleSaveNote() {
    if (!todayCheckin) return;
    setStatus("saving");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase
      .from("checkins")
      .update({ note: editingNote || null })
      .eq("id", todayCheckin.id);

    setStatus("idle");

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setIsEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!todayCheckin) return;
    setStatus("saving");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase
      .from("checkins")
      .delete()
      .eq("id", todayCheckin.id);

    setStatus("idle");

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-foreground">{goal.title}</h3>
          {goal.category && (
            <p className="text-sm text-muted capitalize">{goal.category}</p>
          )}
          <p className="mt-1 text-sm text-muted">
            {target !== null
              ? `${monthCount} of ${target} this month (${percent}%)`
              : `${monthCount} this month (target not yet set)`}
          </p>
        </div>

        {!todayCheckin && (
          <Button
            type="button"
            disabled={status === "saving"}
            onClick={handleCheckIn}
          >
            {status === "saving" ? "Saving..." : "Check in"}
          </Button>
        )}
      </div>

      {!todayCheckin && (
        <div className="mt-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)"
            className="input w-full"
          />

          {showDetails ? (
            <div className="mt-3 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="Calories"
                  inputMode="numeric"
                  className="input text-sm"
                />
                <input
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="Distance"
                  inputMode="decimal"
                  className="input text-sm"
                />
                <input
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="Minutes"
                  inputMode="numeric"
                  className="input text-sm"
                />
              </div>
              <textarea
                value={authorMessage}
                onChange={(e) => setAuthorMessage(e.target.value)}
                placeholder="Post an encouraging message to the group (optional)"
                rows={2}
                className="input w-full text-sm"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="mt-2 text-sm text-muted underline"
            >
              Add details
            </button>
          )}
        </div>
      )}

      {todayCheckin && (
        <div className="mt-3 border border-divider bg-surface p-3">
          <p className="text-sm text-foreground">
            Checked in today
            {todayCheckin.note ? `: "${todayCheckin.note}"` : "."}
          </p>
          {todayCheckin.author_message && (
            <p className="mt-1 text-sm text-foreground italic">
              &ldquo;{todayCheckin.author_message}&rdquo;
            </p>
          )}
          {(todayCheckin.calories !== null ||
            todayCheckin.distance !== null ||
            todayCheckin.duration_minutes !== null) && (
            <p className="mt-1 text-xs text-muted">
              {[
                todayCheckin.calories !== null &&
                  `${todayCheckin.calories} cal`,
                todayCheckin.distance !== null &&
                  `${todayCheckin.distance} distance`,
                todayCheckin.duration_minutes !== null &&
                  `${todayCheckin.duration_minutes} min`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {editable ? (
            <>
              {isEditing ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={editingNote}
                    onChange={(e) => setEditingNote(e.target.value)}
                    className="input flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    disabled={status === "saving"}
                    onClick={handleSaveNote}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit note
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={status === "saving"}
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Edit window closed (24 hours after logging).
            </p>
          )}
        </div>
      )}

      {errorMessage && (
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
      )}
    </Card>
  );
}
