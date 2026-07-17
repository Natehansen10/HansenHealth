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
  created_at: string;
} | null;

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isWithinEditWindow(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < EDIT_WINDOW_MS;
}

export function GoalCheckinRow({
  goal,
  today,
  target,
  monthCount,
  todayCheckin,
}: {
  goal: Goal;
  today: string;
  target: number | null;
  monthCount: number;
  todayCheckin: TodayCheckin;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
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
    });

    setStatus("idle");

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setNote("");
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
          <h3 className="font-medium text-zinc-900">{goal.title}</h3>
          {goal.category && (
            <p className="text-sm text-zinc-500 capitalize">
              {goal.category}
            </p>
          )}
          <p className="mt-1 text-sm text-zinc-600">
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
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)"
          className="mt-3 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
        />
      )}

      {todayCheckin && (
        <div className="mt-3 rounded-md bg-zinc-50 p-3">
          <p className="text-sm text-zinc-700">
            Checked in today
            {todayCheckin.note ? `: "${todayCheckin.note}"` : "."}
          </p>

          {editable ? (
            <>
              {isEditing ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={editingNote}
                    onChange={(e) => setEditingNote(e.target.value)}
                    className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
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
            <p className="mt-2 text-xs text-zinc-400">
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
