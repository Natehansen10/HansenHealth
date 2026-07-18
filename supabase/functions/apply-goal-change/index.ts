// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Recalculates the CURRENT month's goal_monthly_targets row when a goal's
// frequency_per_week changes mid-month (frequency changes now take effect
// immediately -- see CLAUDE.md; this replaced the original "next month
// only" rule). Blended, not simply replaced with a fresh full-month
// figure: the days already elapsed this month keep the OLD frequency's
// implied pace, and the remaining days get the NEW frequency. This is
// fairer than either "ignore the change until next month" or "silently
// make the rest of the month easier/harder by pretending the whole month
// was always at the new rate."
//
// target = round(old_frequency * days_elapsed / 7)
//        + round(new_frequency * days_remaining / 7)
// where days_elapsed includes today, days_remaining is the rest of the
// month (days_elapsed + days_remaining = days_in_month).
//
// The client (lib/actions/goals.ts) updates goals.frequency_per_week
// itself via the normal RLS-governed path (the user's own row, already
// covered by "manage own goals") -- this function only touches
// goal_monthly_targets, which has no client insert/update policy and must
// only ever be written by an Edge Function using the service role key.
//
// Auth: secret key only (service role, bypasses RLS). Never callable with
// a publishable key -- this must not be reachable from a browser.
export default {
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    let body: { goalId?: string; oldFrequency?: number; newFrequency?: number };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const { goalId, oldFrequency, newFrequency } = body;

    if (
      !goalId ||
      typeof oldFrequency !== "number" ||
      typeof newFrequency !== "number" ||
      oldFrequency < 1 ||
      oldFrequency > 7 ||
      newFrequency < 1 ||
      newFrequency > 7
    ) {
      return Response.json(
        { error: "goalId, oldFrequency (1-7), and newFrequency (1-7) are required" },
        { status: 400 },
      );
    }

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const monthStr = monthStart.toISOString().slice(0, 10);
    const daysElapsed = now.getUTCDate(); // today counts as elapsed
    const daysRemaining = daysInMonth - daysElapsed;

    const blendedTarget =
      Math.round((oldFrequency * daysElapsed) / 7) +
      Math.round((newFrequency * daysRemaining) / 7);

    const { data: existing, error: existingError } = await ctx.supabaseAdmin
      .from("goal_monthly_targets")
      .select("id")
      .eq("goal_id", goalId)
      .eq("month", monthStr)
      .maybeSingle();

    if (existingError) {
      return Response.json({ error: existingError.message }, { status: 500 });
    }

    if (!existing) {
      // No target row for this month yet (e.g. snapshot hasn't run) --
      // insert one at the blended figure rather than erroring, so an
      // immediate frequency change still produces a usable target.
      const { error: insertError } = await ctx.supabaseAdmin
        .from("goal_monthly_targets")
        .insert({
          goal_id: goalId,
          month: monthStr,
          frequency_per_week: newFrequency,
          target: blendedTarget,
        });

      if (insertError) {
        return Response.json({ error: insertError.message }, { status: 500 });
      }

      return Response.json({ target: blendedTarget, created: true });
    }

    const { error: updateError } = await ctx.supabaseAdmin
      .from("goal_monthly_targets")
      .update({
        frequency_per_week: newFrequency,
        target: blendedTarget,
      })
      .eq("id", existing.id);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ target: blendedTarget, created: false });
  }),
};
