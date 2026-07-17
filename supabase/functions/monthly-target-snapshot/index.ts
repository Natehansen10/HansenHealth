// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// For each active goal without a goal_monthly_targets row for the current
// (UTC) month, insert one using the goal's current frequency_per_week.
// Non-prorated: a goal created mid-month still gets a full month's target,
// same as a goal that existed since month start. Never recomputed once
// inserted, even if frequency_per_week changes later that month.
//
// Trigger: cron on the 1st of the month (see supabase/config.toml), plus a
// synchronous secret-key call right after goal creation so a brand-new
// goal has a target immediately instead of waiting for the next cron run.
//
// Auth: secret key only (service role, bypasses RLS). Never callable with
// a publishable key -- this must not be reachable from a browser.
export default {
  fetch: withSupabase({ auth: ["secret"] }, async (_req, ctx) => {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const monthStr = monthStart.toISOString().slice(0, 10);

    const { data: goals, error: goalsError } = await ctx.supabaseAdmin
      .from("goals")
      .select("id, frequency_per_week")
      .eq("is_active", true);

    if (goalsError) {
      return Response.json({ error: goalsError.message }, { status: 500 });
    }

    if (!goals || goals.length === 0) {
      return Response.json({ inserted: 0 });
    }

    const { data: existingTargets, error: existingError } =
      await ctx.supabaseAdmin
        .from("goal_monthly_targets")
        .select("goal_id")
        .eq("month", monthStr)
        .in(
          "goal_id",
          goals.map((g) => g.id),
        );

    if (existingError) {
      return Response.json({ error: existingError.message }, { status: 500 });
    }

    const alreadySnapshotted = new Set(
      (existingTargets ?? []).map((t) => t.goal_id),
    );

    const rowsToInsert = goals
      .filter((g) => !alreadySnapshotted.has(g.id))
      .map((g) => ({
        goal_id: g.id,
        month: monthStr,
        frequency_per_week: g.frequency_per_week,
        target: Math.round((g.frequency_per_week * daysInMonth) / 7),
      }));

    if (rowsToInsert.length === 0) {
      return Response.json({ inserted: 0 });
    }

    const { error: insertError } = await ctx.supabaseAdmin
      .from("goal_monthly_targets")
      .insert(rowsToInsert);

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({ inserted: rowsToInsert.length });
  }),
};
