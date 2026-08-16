"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";
import { todayInTimezone } from "@/lib/utils/dates";
import {
  HEALTH_METRIC_BY_KEY,
  isPersonalMetricFrequency,
  isValidDateString,
  parseMetricInput,
  type HealthMetricKey,
} from "@/lib/utils/health";

// Server Actions for the personal health log.
//
// All of these use the RLS-governed client, NOT the service role -- there
// is no Edge Function in this path and nothing here needs to bypass RLS, so
// the policies in 20260815000000 are the real authority on who may write
// what. The ownership checks below exist to produce a readable error
// message instead of a bare policy rejection, and to reject bad input
// before it reaches Postgres; they are not the security boundary.
//
// Every action returns { error: string | null }, matching the house shape
// used by lib/actions/goals.ts and lib/actions/family-prizes.ts.

type ActionResult = { error: string | null };

type HealthLogUpdate = Database["public"]["Tables"]["health_logs"]["Update"];

const SESSION_EXPIRED = "Your session expired. Please sign in again.";

// Revalidate every route that renders health data. /log and /health both
// read it directly; the dashboard shows a "logged today" indicator; a
// family member's page shows it when sharing is on.
function revalidateHealthRoutes() {
  revalidatePath("/log");
  revalidatePath("/health");
  revalidatePath("/");
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Resolves the date a write should land on. An omitted date means "today in
// the user's own timezone", computed server-side from profiles.timezone --
// never taken from the browser, per the project's per-user timezone rule.
// An explicit date is validated and may not be in the future.
async function resolveLogDate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  requestedDate?: string,
): Promise<{ date: string } | { error: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  const today = todayInTimezone(profile?.timezone ?? "America/Denver");

  if (requestedDate === undefined) return { date: today };

  if (!isValidDateString(requestedDate)) {
    return { error: "That date isn't valid." };
  }
  if (requestedDate > today) {
    // Safe as a string compare: both are zero-padded YYYY-MM-DD.
    return { error: "You can't log a day that hasn't happened yet." };
  }

  return { date: requestedDate };
}

export type HealthLogInput = {
  // Only the keys present are written. A key present with "" clears that
  // value; a key that is absent is left exactly as it was. This is what
  // lets the /log page save one section at a time without wiping the
  // metrics belonging to the sections it didn't render.
  values: Partial<Record<HealthMetricKey, string>>;
  note?: string;
  logDate?: string;
};

export async function saveHealthLog(
  input: HealthLogInput,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: SESSION_EXPIRED };

  const resolved = await resolveLogDate(supabase, user.id, input.logDate);
  if ("error" in resolved) return { error: resolved.error };

  // Validate everything before writing anything, so a bad diastolic doesn't
  // leave a half-saved row with only the systolic applied.
  //
  // Built as a metric-keyed record first rather than writing straight into
  // a HealthLogUpdate: every built-in metric column is `number | null`, so
  // this shape is checked against HealthMetricKey, and the generated
  // Update type then rejects anything that isn't a real column when the
  // two are merged below.
  const metricPatch: Partial<Record<HealthMetricKey, number | null>> = {};
  for (const [key, raw] of Object.entries(input.values)) {
    const def = HEALTH_METRIC_BY_KEY[key as HealthMetricKey];
    if (!def) return { error: `Unknown metric: ${key}` };

    const parsed = parseMetricInput(raw ?? "", def);
    if (!parsed.ok) return { error: parsed.error };
    metricPatch[key as HealthMetricKey] = parsed.value;
  }

  const patch: HealthLogUpdate = {
    ...metricPatch,
    ...(input.note !== undefined ? { note: input.note.trim() || null } : {}),
  };

  if (Object.keys(patch).length === 0) {
    return { error: null };
  }

  const { data: existing } = await supabase
    .from("health_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("log_date", resolved.date)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("health_logs")
      .update(patch)
      .eq("id", existing.id);

    if (error) {
      console.error("saveHealthLog update failed", error);
      return { error: "Could not save your log. Please try again." };
    }
  } else {
    const { error } = await supabase.from("health_logs").insert({
      user_id: user.id,
      log_date: resolved.date,
      ...patch,
    });

    if (error) {
      // 23505 = unique_violation on (user_id, log_date): another save for
      // the same day landed between the select above and this insert. The
      // row now exists, so retry as the update this should have been.
      if (error.code === "23505") {
        const { error: retryError } = await supabase
          .from("health_logs")
          .update(patch)
          .eq("user_id", user.id)
          .eq("log_date", resolved.date);

        if (retryError) {
          console.error("saveHealthLog retry failed", retryError);
          return { error: "Could not save your log. Please try again." };
        }
      } else {
        console.error("saveHealthLog insert failed", error);
        return { error: "Could not save your log. Please try again." };
      }
    }
  }

  revalidateHealthRoutes();
  return { error: null };
}

export async function deleteHealthLog(logDate: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: SESSION_EXPIRED };

  if (!isValidDateString(logDate)) {
    return { error: "That date isn't valid." };
  }

  const { error } = await supabase
    .from("health_logs")
    .delete()
    .eq("user_id", user.id)
    .eq("log_date", logDate);

  if (error) {
    console.error("deleteHealthLog failed", error);
    return { error: "Could not delete that entry. Please try again." };
  }

  revalidateHealthRoutes();
  return { error: null };
}

export type PersonalMetricInput = {
  name: string;
  unit: string;
  targetValue: string;
  frequency: string;
};

function validateMetricInput(
  input: PersonalMetricInput,
):
  | { ok: true; name: string; unit: string | null; targetValue: number | null; frequency: string }
  | { ok: false; error: string } {
  const name = input.name.trim();
  if (name === "") return { ok: false, error: "Give your metric a name." };
  if (name.length > 60) {
    return { ok: false, error: "Metric names are limited to 60 characters." };
  }

  const unit = input.unit.trim();
  if (unit.length > 20) {
    return { ok: false, error: "Units are limited to 20 characters." };
  }

  let targetValue: number | null = null;
  const rawTarget = input.targetValue.trim();
  if (rawTarget !== "") {
    const parsed = Number(rawTarget);
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: "Target must be a number." };
    }
    targetValue = parsed;
  }

  if (!isPersonalMetricFrequency(input.frequency)) {
    return { ok: false, error: "Pick a valid frequency." };
  }

  return {
    ok: true,
    name,
    unit: unit || null,
    targetValue,
    frequency: input.frequency,
  };
}

export async function createPersonalMetric(
  input: PersonalMetricInput,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: SESSION_EXPIRED };

  const validated = validateMetricInput(input);
  if (!validated.ok) return { error: validated.error };

  const { error } = await supabase.from("personal_metrics").insert({
    user_id: user.id,
    name: validated.name,
    unit: validated.unit,
    target_value: validated.targetValue,
    frequency: validated.frequency,
  });

  if (error) {
    console.error("createPersonalMetric failed", error);
    return { error: "Could not create that metric. Please try again." };
  }

  revalidateHealthRoutes();
  return { error: null };
}

export async function updatePersonalMetric(
  metricId: string,
  input: PersonalMetricInput,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: SESSION_EXPIRED };

  const validated = validateMetricInput(input);
  if (!validated.ok) return { error: validated.error };

  // Scoped by user_id as well as id: RLS would reject a foreign metric
  // anyway, but an update that matches zero rows reports success, so
  // without this the caller would be told it saved when it didn't.
  const { data, error } = await supabase
    .from("personal_metrics")
    .update({
      name: validated.name,
      unit: validated.unit,
      target_value: validated.targetValue,
      frequency: validated.frequency,
    })
    .eq("id", metricId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("updatePersonalMetric failed", error);
    return { error: "Could not save that metric. Please try again." };
  }
  if (!data || data.length === 0) {
    return { error: "You can only edit your own metrics." };
  }

  revalidateHealthRoutes();
  return { error: null };
}

export async function setPersonalMetricActive(
  metricId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: SESSION_EXPIRED };

  const { data, error } = await supabase
    .from("personal_metrics")
    .update({ is_active: isActive })
    .eq("id", metricId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("setPersonalMetricActive failed", error);
    return { error: "Could not update that metric. Please try again." };
  }
  if (!data || data.length === 0) {
    return { error: "You can only edit your own metrics." };
  }

  revalidateHealthRoutes();
  return { error: null };
}

export async function logPersonalMetricEntry(
  metricId: string,
  rawValue: string,
  entryDate?: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: SESSION_EXPIRED };

  const resolved = await resolveLogDate(supabase, user.id, entryDate);
  if ("error" in resolved) return { error: resolved.error };

  const trimmed = rawValue.trim();

  // Confirm the metric is this user's before writing. The insert policy
  // enforces the same thing, but it can't tell the difference between
  // "someone else's metric" and "a metric that was just deleted", and the
  // user deserves the right message.
  const { data: metric } = await supabase
    .from("personal_metrics")
    .select("id")
    .eq("id", metricId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!metric) {
    return { error: "You can only log entries for your own metrics." };
  }

  // An empty value clears the day's entry rather than storing a zero --
  // "I didn't record this" and "I recorded a 0" are different facts, and
  // personal_metric_entries.value is not nullable precisely so the absence
  // of a row is the only way to say the former.
  if (trimmed === "") {
    const { error } = await supabase
      .from("personal_metric_entries")
      .delete()
      .eq("metric_id", metricId)
      .eq("user_id", user.id)
      .eq("entry_date", resolved.date);

    if (error) {
      console.error("logPersonalMetricEntry clear failed", error);
      return { error: "Could not clear that entry. Please try again." };
    }

    revalidateHealthRoutes();
    return { error: null };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { error: "Value must be a number." };
  }

  const { error } = await supabase.from("personal_metric_entries").upsert(
    {
      metric_id: metricId,
      user_id: user.id,
      entry_date: resolved.date,
      value,
    },
    { onConflict: "metric_id,entry_date" },
  );

  if (error) {
    console.error("logPersonalMetricEntry failed", error);
    return { error: "Could not save that entry. Please try again." };
  }

  revalidateHealthRoutes();
  return { error: null };
}

export async function setHealthVisibility(
  visibility: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: SESSION_EXPIRED };

  if (visibility !== "private" && visibility !== "family") {
    return { error: "Pick a valid sharing option." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ health_visibility: visibility })
    .eq("id", user.id);

  if (error) {
    console.error("setHealthVisibility failed", error);
    return { error: "Could not update sharing. Please try again." };
  }

  revalidateHealthRoutes();
  revalidatePath("/settings");
  return { error: null };
}

export async function setWeightUnit(unit: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: SESSION_EXPIRED };

  if (unit !== "lb" && unit !== "kg") {
    return { error: "Pick a valid unit." };
  }

  // Label only -- no stored weight is touched or converted. See the
  // weight_unit note in 20260815000000_personal_health_logs.sql.
  const { error } = await supabase
    .from("profiles")
    .update({ weight_unit: unit })
    .eq("id", user.id);

  if (error) {
    console.error("setWeightUnit failed", error);
    return { error: "Could not update your weight unit. Please try again." };
  }

  revalidateHealthRoutes();
  revalidatePath("/settings");
  return { error: null };
}
