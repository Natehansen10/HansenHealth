// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
// Direct relative import reaching outside supabase/functions/, sharing the
// exact same aggregatePercent/goalPercent formula as the dashboard summary
// bar (lib/utils/progress.ts). CLAUDE.md requires these to be the exact
// same formula -- do not reimplement or fork this logic here.
//
// UNTESTED / NEEDS EMPIRICAL DEPLOY VERIFICATION: `supabase functions
// deploy` (no --use-api flag) has a known history of failing on imports
// that reach outside supabase/functions/ (supabase/cli#1028). This must be
// verified against a real `supabase functions deploy monthly-prize-calculation`
// run before being trusted. If it fails, fall back to the documented
// `_shared/` convention (copy progress.ts into supabase/functions/_shared/
// with a loud drift warning in both files) instead of this import.
import {
  aggregatePercent,
  type GoalProgress,
} from "../../../lib/utils/progress.ts";

// For each family, for each member, for each active goal, sum check-ins vs.
// that goal's monthly target for the PRIOR (UTC) calendar month, and
// compute an aggregate percentage per user via the shared aggregatePercent
// formula (average of each active goal's capped percent -- the same
// formula the dashboard summary bar uses). Any user at or above 100% wins
// a monthly_prizes row for that family/month. Every qualifying user wins;
// there is no single-winner or tiebreaker logic.
//
// Trigger: cron on the 1st of the month at 00:15 UTC (see
// supabase/config.toml + the cron migration), evaluating the month that
// just ended. Month boundaries are plain UTC, matching
// monthly-target-snapshot's existing convention -- no per-user timezone
// handling here, consistent with the build plan's "cron at 00:15 UTC"
// framing and with how monthly-target-snapshot already treats "the
// current month" as a UTC calendar month.
//
// Idempotent: upserts into monthly_prizes with onConflict on the table's
// (family_id, month, user_id) unique constraint, so re-running this for a
// month that was already processed (retries, manual re-invocation while
// testing) never errors and never double-awards.
//
// Auth: secret key only (service role, bypasses RLS), same as
// monthly-target-snapshot and notify-activity. Never callable with a
// publishable key.
export default {
  fetch: withSupabase({ auth: ["secret"] }, async (_req, ctx) => {
    const now = new Date();
    // Prior UTC calendar month: if today is anywhere in July, the prior
    // month is June 1 (inclusive) through July 1 (exclusive).
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const priorMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const priorMonthStr = priorMonthStart.toISOString().slice(0, 10);
    const currentMonthStr = currentMonthStart.toISOString().slice(0, 10);

    // 1. All families.
    const { data: families, error: familiesError } = await ctx.supabaseAdmin
      .from("families")
      .select("id");

    if (familiesError) {
      return Response.json({ error: familiesError.message }, { status: 500 });
    }

    if (!families || families.length === 0) {
      return Response.json({ familiesProcessed: 0, prizesAwarded: 0 });
    }

    // 2. All profiles (members) across all families, grouped by family.
    const { data: allMembers, error: membersError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, family_id")
      .in(
        "family_id",
        families.map((f) => f.id),
      );

    if (membersError) {
      return Response.json({ error: membersError.message }, { status: 500 });
    }

    const memberIds = (allMembers ?? []).map((m) => m.id);

    if (memberIds.length === 0) {
      return Response.json({ familiesProcessed: families.length, prizesAwarded: 0 });
    }

    // 3. All active goals for those members.
    const { data: allGoals, error: goalsError } = await ctx.supabaseAdmin
      .from("goals")
      .select("id, user_id")
      .eq("is_active", true)
      .in("user_id", memberIds);

    if (goalsError) {
      return Response.json({ error: goalsError.message }, { status: 500 });
    }

    const goalIds = (allGoals ?? []).map((g) => g.id);

    // 4. Prior month's targets for those goals.
    const { data: targets, error: targetsError } = goalIds.length > 0
      ? await ctx.supabaseAdmin
        .from("goal_monthly_targets")
        .select("goal_id, target")
        .eq("month", priorMonthStr)
        .in("goal_id", goalIds)
      : { data: [], error: null };

    if (targetsError) {
      return Response.json({ error: targetsError.message }, { status: 500 });
    }

    const targetByGoal = new Map<string, number>(
      (targets ?? []).map((t) => [t.goal_id, t.target]),
    );

    // 5. Check-ins within the prior month for those goals.
    const { data: checkins, error: checkinsError } = goalIds.length > 0
      ? await ctx.supabaseAdmin
        .from("checkins")
        .select("goal_id")
        .in("goal_id", goalIds)
        .gte("checkin_date", priorMonthStr)
        .lt("checkin_date", currentMonthStr)
      : { data: [], error: null };

    if (checkinsError) {
      return Response.json({ error: checkinsError.message }, { status: 500 });
    }

    const countByGoal = new Map<string, number>();
    for (const c of checkins ?? []) {
      countByGoal.set(c.goal_id, (countByGoal.get(c.goal_id) ?? 0) + 1);
    }

    // 6. Build per-user GoalProgress[] and compute aggregatePercent.
    const familyByMember = new Map(
      (allMembers ?? []).map((m) => [m.id, m.family_id]),
    );

    const goalsByUser = new Map<string, GoalProgress[]>();
    for (const g of allGoals ?? []) {
      const progress: GoalProgress = {
        goalId: g.id,
        checkinCount: countByGoal.get(g.id) ?? 0,
        target: targetByGoal.get(g.id) ?? null,
      };
      const existing = goalsByUser.get(g.user_id);
      if (existing) {
        existing.push(progress);
      } else {
        goalsByUser.set(g.user_id, [progress]);
      }
    }

    const prizeRows: { family_id: string; month: string; user_id: string }[] = [];

    for (const memberId of memberIds) {
      const familyId = familyByMember.get(memberId);
      if (!familyId) continue;

      const progress = goalsByUser.get(memberId) ?? [];
      const percent = aggregatePercent(progress);

      if (percent !== null && percent >= 100) {
        prizeRows.push({
          family_id: familyId,
          month: priorMonthStr,
          user_id: memberId,
        });
      }
    }

    if (prizeRows.length === 0) {
      return Response.json({
        familiesProcessed: families.length,
        prizesAwarded: 0,
      });
    }

    // 7. Idempotent upsert: (family_id, month, user_id) is unique on
    // monthly_prizes, so re-running this function for a month that was
    // already processed (retries, manual re-invocation) never errors and
    // never double-awards -- ignoreDuplicates leaves any existing row
    // (and its original awarded_at) untouched.
    const { error: upsertError } = await ctx.supabaseAdmin
      .from("monthly_prizes")
      .upsert(prizeRows, {
        onConflict: "family_id,month,user_id",
        ignoreDuplicates: true,
      });

    if (upsertError) {
      return Response.json({ error: upsertError.message }, { status: 500 });
    }

    return Response.json({
      familiesProcessed: families.length,
      prizesAwarded: prizeRows.length,
    });
  }),
};
