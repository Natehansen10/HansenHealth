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
  currentUserName,
  initialComments,
}: {
  checkinId: string;
  currentUserId: string;
  currentUserName: string;
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
        { ...data, authorName: currentUserName },
      ]);
      setBody("");
    }
  }

  return (
    <div className="mt-2">
      {comments.length > 0 && (
        <ul className="mb-2 flex flex-col gap-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="border-l-2 border-divider pl-2 text-sm"
            >
              <div className="font-heading text-xs font-semibold text-foreground">
                {comment.authorName}
              </div>
              <div className="text-foreground">{comment.body}</div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment"
          className="input flex-1 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="text-sm font-medium text-foreground disabled:opacity-50"
        >
          Post
        </button>
      </form>
    </div>
  );
}
