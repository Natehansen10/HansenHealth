"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
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

type RawGoalActivity = {
  id: string;
  change_summary: string;
  created_at: string;
  user_id: string;
  goal_id: string;
  profiles: { full_name: string } | { full_name: string }[] | null;
};

type FeedCheckin = {
  kind: "checkin";
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

type FeedGoalActivity = {
  kind: "goal_activity";
  id: string;
  createdAt: string;
  userId: string;
  authorName: string;
  changeSummary: string;
};

type FeedItem = FeedCheckin | FeedGoalActivity;

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toFeedCheckin(raw: RawCheckin): Omit<
  FeedCheckin,
  "kind" | "likeCount" | "likedByMe" | "comments"
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

function toFeedGoalActivity(raw: RawGoalActivity): FeedGoalActivity {
  return {
    kind: "goal_activity",
    id: raw.id,
    createdAt: raw.created_at,
    userId: raw.user_id,
    authorName: firstOf(raw.profiles)?.full_name ?? "Someone",
    changeSummary: raw.change_summary,
  };
}

export function ActivityFeed({
  currentUserId,
  currentUserName,
  familyMemberIds,
  initialCheckins,
  initialGoalActivity,
}: {
  currentUserId: string;
  currentUserName: string;
  familyMemberIds: string[];
  initialCheckins: RawCheckin[];
  initialGoalActivity: RawGoalActivity[];
}) {
  const [checkins, setCheckins] = useState<FeedCheckin[]>([]);
  const [goalActivity, setGoalActivity] = useState<FeedGoalActivity[]>(
    initialGoalActivity.map(toFeedGoalActivity),
  );
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Realtime health. The feed still renders its server-provided snapshot
  // when this goes bad -- what's lost is only the live updating, so this
  // surfaces as a banner above the feed rather than replacing it.
  const [connection, setConnection] = useState<"connecting" | "live" | "down">(
    "connecting",
  );

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

      const [{ data: reactions, error: reactionsError }, { data: comments }] = await Promise.all([
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

      // A failed reactions/comments fetch shouldn't blank the feed -- the
      // check-ins themselves came from the server render and are still
      // good. Note it and fall through with zero likes/comments.
      if (reactionsError) {
        console.error("activity feed reactions load failed", reactionsError);
        setLoadError(true);
      }

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
          kind: "checkin" as const,
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
    const goalActivityIds = new Set(initialGoalActivity.map((a) => a.id));
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
              kind: "checkin",
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "goal_activity_log" },
        async (payload) => {
          const newRow = payload.new as {
            id: string;
            change_summary: string;
            created_at: string;
            user_id: string;
            goal_id: string;
          };

          // Same defense-in-depth as the checkins subscription above: RLS
          // already scopes what this subscription receives, but confirm the
          // actor is a known family member before rendering.
          if (!memberIds.has(newRow.user_id)) return;
          if (goalActivityIds.has(newRow.id)) return;
          goalActivityIds.add(newRow.id);

          const { data: author } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", newRow.user_id)
            .maybeSingle();

          setGoalActivity((prev) => [
            {
              kind: "goal_activity",
              id: newRow.id,
              createdAt: newRow.created_at,
              userId: newRow.user_id,
              authorName: author?.full_name ?? "Someone",
              changeSummary: newRow.change_summary,
            },
            ...prev,
          ]);
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        // CHANNEL_ERROR / TIMED_OUT / CLOSED all mean the same thing to the
        // user: new activity will stop appearing on its own until they
        // reload. SUBSCRIBED after a retry clears it again.
        if (status === "SUBSCRIBED") {
          setConnection("live");
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setConnection("down");
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // Runs once per mount only: currentUserId/familyMemberIds/initialCheckins/
    // initialGoalActivity are a server-provided snapshot for this page load,
    // not values that should re-trigger a resubscribe if they were to
    // change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) {
    // Skeletons rather than a spinner: the feed's shape is known (a column
    // of cards), so this holds the layout instead of collapsing it.
    return (
      <div className="flex flex-col gap-4">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={1} />
      </div>
    );
  }

  const items: FeedItem[] = [...checkins, ...goalActivity].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const banner =
    connection === "down" ? (
      <Alert
        tone="warning"
        title="Live updates are off"
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        }
      >
        New check-ins won&rsquo;t appear until you reload.
      </Alert>
    ) : loadError ? (
      <Alert tone="warning" title="Some details didn't load">
        Likes and comments may be missing or out of date.
      </Alert>
    ) : null;

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {banner}
        <EmptyState
          title="No activity yet"
          description="Check-ins, likes and comments from everyone in the family show up here as they happen."
          action={
            <Link href="/log">
              <Button type="button">Log today</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {banner}
      {items.map((item) =>
        item.kind === "goal_activity" ? (
          <p key={item.id} className="text-sm text-muted">
            <span className="font-medium text-foreground">
              {item.authorName}
            </span>{" "}
            {item.changeSummary}
          </p>
        ) : (
          <Card key={item.id}>
            <p className="text-foreground">
              <span className="font-medium">{item.authorName}</span>{" "}
              checked in on {item.goalTitle}
              {item.note ? `: "${item.note}"` : ""}
            </p>
            <div className="mt-2 flex items-center gap-4">
              <LikeButton
                checkinId={item.id}
                currentUserId={currentUserId}
                initialLikeCount={item.likeCount}
                initialLikedByMe={item.likedByMe}
              />
            </div>
            <CommentThread
              checkinId={item.id}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              initialComments={item.comments}
            />
          </Card>
        ),
      )}
    </div>
  );
}
