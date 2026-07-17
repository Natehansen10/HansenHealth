"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { LikeButton } from "@/components/family/like-button";
import { CommentThread } from "@/components/family/comment-thread";

type RawCheckin = {
  id: string;
  checkin_date: string;
  note: string | null;
  created_at: string;
  user_id: string;
  goal_id: string;
  goals: { title: string } | { title: string }[] | null;
  profiles: { full_name: string } | { full_name: string }[] | null;
};

type FeedCheckin = {
  id: string;
  note: string | null;
  createdAt: string;
  userId: string;
  goalId: string;
  goalTitle: string;
  authorName: string;
  likeCount: number;
  likedByMe: boolean;
  comments: { id: string; body: string; user_id: string; authorName: string }[];
};

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toFeedCheckin(raw: RawCheckin): Omit<
  FeedCheckin,
  "likeCount" | "likedByMe" | "comments"
> {
  return {
    id: raw.id,
    note: raw.note,
    createdAt: raw.created_at,
    userId: raw.user_id,
    goalId: raw.goal_id,
    goalTitle: firstOf(raw.goals)?.title ?? "a goal",
    authorName: firstOf(raw.profiles)?.full_name ?? "Someone",
  };
}

export function ActivityFeed({
  currentUserId,
  familyMemberIds,
  initialCheckins,
}: {
  currentUserId: string;
  familyMemberIds: string[];
  initialCheckins: RawCheckin[];
}) {
  const [checkins, setCheckins] = useState<FeedCheckin[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadReactionsAndComments() {
      const ids = initialCheckins.map((c) => c.id);
      if (ids.length === 0) {
        if (!cancelled) {
          setCheckins([]);
          setLoaded(true);
        }
        return;
      }

      const [{ data: reactions }, { data: comments }] = await Promise.all([
        supabase
          .from("reactions")
          .select("checkin_id, user_id")
          .in("checkin_id", ids),
        supabase
          .from("comments")
          .select("id, checkin_id, body, user_id, profiles(full_name)")
          .in("checkin_id", ids)
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;

      const built = initialCheckins.map((raw) => {
        const base = toFeedCheckin(raw);
        const checkinReactions = (reactions ?? []).filter(
          (r) => r.checkin_id === raw.id,
        );
        const checkinComments = (comments ?? [])
          .filter((c) => c.checkin_id === raw.id)
          .map((c) => ({
            id: c.id,
            body: c.body,
            user_id: c.user_id,
            authorName:
              (firstOf(c.profiles as { full_name: string } | { full_name: string }[] | null)
                ?.full_name) ?? "Someone",
          }));

        return {
          ...base,
          likeCount: checkinReactions.length,
          likedByMe: checkinReactions.some((r) => r.user_id === currentUserId),
          comments: checkinComments,
        };
      });

      setCheckins(built);
      setLoaded(true);
    }

    loadReactionsAndComments();

    const checkinIds = new Set(initialCheckins.map((c) => c.id));
    const memberIds = new Set(familyMemberIds);

    const channel = supabase
      .channel("family-activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "checkins" },
        async (payload) => {
          const newRow = payload.new as {
            id: string;
            checkin_date: string;
            note: string | null;
            created_at: string;
            user_id: string;
            goal_id: string;
          };

          // RLS already limits what this subscription receives to rows the
          // current user can select, but user_id isn't necessarily a known
          // family member if goals/profiles changed after mount -- confirm
          // before fetching join data.
          if (!memberIds.has(newRow.user_id)) return;
          if (checkinIds.has(newRow.id)) return;
          checkinIds.add(newRow.id);

          const [{ data: goal }, { data: author }] = await Promise.all([
            supabase
              .from("goals")
              .select("title")
              .eq("id", newRow.goal_id)
              .maybeSingle(),
            supabase
              .from("profiles")
              .select("full_name")
              .eq("id", newRow.user_id)
              .maybeSingle(),
          ]);

          setCheckins((prev) => [
            {
              id: newRow.id,
              note: newRow.note,
              createdAt: newRow.created_at,
              userId: newRow.user_id,
              goalId: newRow.goal_id,
              goalTitle: goal?.title ?? "a goal",
              authorName: author?.full_name ?? "Someone",
              likeCount: 0,
              likedByMe: false,
              comments: [],
            },
            ...prev,
          ]);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions" },
        (payload) => {
          const row = payload.new as { checkin_id: string; user_id: string };
          if (!checkinIds.has(row.checkin_id)) return;
          setCheckins((prev) =>
            prev.map((c) =>
              c.id === row.checkin_id
                ? {
                    ...c,
                    likeCount: c.likeCount + 1,
                    likedByMe:
                      row.user_id === currentUserId ? true : c.likedByMe,
                  }
                : c,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "reactions" },
        (payload) => {
          const row = payload.old as { checkin_id: string; user_id: string };
          if (!checkinIds.has(row.checkin_id)) return;
          setCheckins((prev) =>
            prev.map((c) =>
              c.id === row.checkin_id
                ? {
                    ...c,
                    likeCount: Math.max(0, c.likeCount - 1),
                    likedByMe:
                      row.user_id === currentUserId ? false : c.likedByMe,
                  }
                : c,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        async (payload) => {
          const row = payload.new as {
            id: string;
            checkin_id: string;
            body: string;
            user_id: string;
          };
          if (!checkinIds.has(row.checkin_id)) return;
          if (row.user_id === currentUserId) return; // already added locally

          const { data: authorProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", row.user_id)
            .maybeSingle();

          setCheckins((prev) =>
            prev.map((c) =>
              c.id === row.checkin_id
                ? {
                    ...c,
                    comments: [
                      ...c.comments,
                      {
                        id: row.id,
                        body: row.body,
                        user_id: row.user_id,
                        authorName: authorProfile?.full_name ?? "Someone",
                      },
                    ],
                  }
                : c,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // Runs once per mount only: currentUserId/familyMemberIds/initialCheckins
    // are a server-provided snapshot for this page load, not values that
    // should re-trigger a resubscribe if they were to change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) {
    return <p className="text-sm text-zinc-400">Loading activity...</p>;
  }

  if (checkins.length === 0) {
    return <p className="text-zinc-500">No check-ins yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {checkins.map((checkin) => (
        <Card key={checkin.id}>
          <p className="text-zinc-900">
            <span className="font-medium">{checkin.authorName}</span>{" "}
            checked in on {checkin.goalTitle}
            {checkin.note ? `: "${checkin.note}"` : ""}
          </p>
          <div className="mt-2 flex items-center gap-4">
            <LikeButton
              checkinId={checkin.id}
              currentUserId={currentUserId}
              initialLikeCount={checkin.likeCount}
              initialLikedByMe={checkin.likedByMe}
            />
          </div>
          <CommentThread
            checkinId={checkin.id}
            currentUserId={currentUserId}
            initialComments={checkin.comments}
          />
        </Card>
      ))}
    </div>
  );
}
