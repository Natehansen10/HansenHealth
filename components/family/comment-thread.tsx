"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Comment = {
  id: string;
  body: string;
  user_id: string;
  authorName: string;
};

export function CommentThread({
  checkinId,
  currentUserId,
  initialComments,
}: {
  checkinId: string;
  currentUserId: string;
  initialComments: Comment[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({ checkin_id: checkinId, user_id: currentUserId, body })
      .select("id, body, user_id")
      .single();

    setBusy(false);

    if (!error && data) {
      setComments((prev) => [
        ...prev,
        { ...data, authorName: "You" },
      ]);
      setBody("");
    }
  }

  return (
    <div className="mt-2">
      {comments.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {comments.map((comment) => (
            <li key={comment.id} className="text-sm text-zinc-700">
              <span className="font-medium">{comment.authorName}</span>{" "}
              {comment.body}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment"
          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          Post
        </button>
      </form>
    </div>
  );
}
