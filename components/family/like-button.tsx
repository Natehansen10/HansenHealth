"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LikeButton({
  checkinId,
  currentUserId,
  initialLikeCount,
  initialLikedByMe,
}: {
  checkinId: string;
  currentUserId: string;
  initialLikeCount: number;
  initialLikedByMe: boolean;
}) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [likedByMe, setLikedByMe] = useState(initialLikedByMe);
  const [busy, setBusy] = useState(false);

  async function handleToggle() {
    if (busy) return;
    setBusy(true);

    const supabase = createClient();

    if (likedByMe) {
      const { error } = await supabase
        .from("reactions")
        .delete()
        .eq("checkin_id", checkinId)
        .eq("user_id", currentUserId);

      if (!error) {
        setLikedByMe(false);
        setLikeCount((c) => Math.max(0, c - 1));
      }
    } else {
      const { error } = await supabase.from("reactions").insert({
        checkin_id: checkinId,
        user_id: currentUserId,
      });

      if (!error) {
        setLikedByMe(true);
        setLikeCount((c) => c + 1);
      }
    }

    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={busy}
      className={`text-sm ${likedByMe ? "text-red-600" : "text-zinc-500"} hover:text-red-600 disabled:opacity-50`}
    >
      {likedByMe ? "♥" : "♡"} {likeCount > 0 ? likeCount : ""}
    </button>
  );
}
