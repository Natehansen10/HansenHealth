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
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("comments")
        .insert({ checkin_id: checkinId, user_id: currentUserId, body })
        .select("id, body, user_id")
        .single();

      if (error || !data) {
        // Previously this branch did nothing at all: a failed insert left
        // the typed comment sitting in the box with no indication it hadn't
        // posted, which reads as "the button doesn't work".
        setErrorMessage("Couldn't post that comment. Try again.");
        return;
      }

      setComments((prev) => [
        ...prev,
        { ...data, authorName: currentUserName },
      ]);
      setBody("");
    } catch (err) {
      console.error("comment insert failed", err);
      setErrorMessage("Couldn't post that comment. Check your connection.");
    } finally {
      setBusy(false);
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
          onChange={(e) => {
            setBody(e.target.value);
            setErrorMessage("");
          }}
          placeholder="Add a comment"
          aria-label="Add a comment"
          className="input flex-1 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="min-h-9 px-2 text-sm font-medium text-foreground disabled:opacity-50"
        >
          {busy ? "..." : "Post"}
        </button>
      </form>
      {errorMessage && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
