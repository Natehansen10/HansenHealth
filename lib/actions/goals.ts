"use server";

import { createClient } from "@/lib/supabase/server";

// Fires the apply-goal-change Edge Function to blend the current month's
// target when a goal's frequency_per_week changes mid-month (frequency
// changes now take effect immediately -- see CLAUDE.md). Uses the service
// role key -- must only ever run server-side (Server Action), never in a
// Client Component. Unlike triggerTargetSnapshot below, this reports
// success/failure back to the caller: the UI needs to know whether the
// recalculation actually happened before confirming the change.
//
// The Edge Function itself trusts goalId completely (service role bypasses
// RLS) -- a Server Action is directly callable by any authenticated client
// script with arbitrary arguments, not just via goal-card.tsx's UI flow, so
// this function MUST verify goal ownership itself before ever calling the
// Edge Function. This mirrors the existing "manage own goals" RLS policy
// (user_id = auth.uid()) as an explicit gate in front of the privileged
// call, rather than relying on the caller having already done an RLS-
// governed update first (which nothing enforces for a Server Action).
export async function applyGoalChange(
  goalId: string,
  oldFrequency: number,
  newFrequency: number,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const { data: goal } = await supabase
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!goal) {
    return { error: "You can only change your own goals." };
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/apply-goal-change`;

  // Timeout so a cold-starting/hung Edge Function can't leave the goal-card
  // spinner stuck on "Saving..." forever (this call is awaited by the UI,
  // unlike the fire-and-forget snapshot). 8s is generous enough for a cold
  // start but bounded.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apiKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ goalId, oldFrequency, newFrequency }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("apply-goal-change failed", response.status, text);
      return { error: "Could not recalculate this month's target." };
    }

    return { error: null };
  } catch (err) {
    console.error("apply-goal-change request failed", err);
    return { error: "Could not recalculate this month's target." };
  } finally {
    clearTimeout(timeout);
  }
}

// Fires the monthly-target-snapshot Edge Function so a brand-new goal gets
// a target row for the current month immediately, instead of waiting for
// the next cron run. Uses the service role key -- must only ever run
// server-side (Server Action), never in a Client Component.
export async function triggerTargetSnapshot() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/monthly-target-snapshot`;

  // Hard timeout on the Edge Function call. This matters even though callers
  // invoke this "fire-and-forget" (without awaiting): Next.js's App Router
  // tracks in-flight Server Action requests and holds the subsequent
  // router.push()/router.refresh() transition open until they settle. A
  // cold-starting or hung Edge Function (no timeout of its own) would
  // therefore pin the client on "Creating..." indefinitely even though the
  // goal row was already committed -- the exact symptom reported. Cap it so
  // the transition can always complete; the daily cron backfills any goal
  // this call doesn't reach in time.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apiKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        "monthly-target-snapshot failed",
        response.status,
        await response.text(),
      );
    }
  } catch (err) {
    // Best-effort: a goal is still valid without an immediate target row --
    // the next cron run will pick it up. Don't fail goal creation over this
    // (includes the AbortError from the timeout above).
    console.error("monthly-target-snapshot request failed", err);
  } finally {
    clearTimeout(timeout);
  }
}
