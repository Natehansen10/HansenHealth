"use server";

import { revalidatePath } from "next/cache";
import type postgres from "postgres";
import {
  PG_CHECK_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
  sql,
} from "@/lib/db";
import { memberProgress, type Db } from "@/lib/queries";

// Every write in the app. Each action re-checks its inputs on the server:
// a Server Action can be called with any arguments, not only from the form
// that normally calls it.

export type ActionState = { ok: boolean; message: string } | null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}-01$/;

// Thrown inside a transaction to roll it back with a message for the user.
class UserError extends Error {}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

function fail(err: unknown): ActionState {
  if (err instanceof UserError) return { ok: false, message: err.message };
  console.error(err);
  return {
    ok: false,
    message: "Something went wrong saving that. Please try again.",
  };
}

// Opens a month: snapshot every active goal's weekly frequency into
// goal_monthly_targets. The view then calculates each target from it.
// ON CONFLICT DO NOTHING makes it safe to run more than once, and means an
// existing snapshot is never rewritten when a goal changes later.
// In the production app a scheduled job does this on the 1st; here the first
// write of a new month does it.
async function ensureMonthSnapshot(db: Db, month: string) {
  const q = db as postgres.Sql;
  await q`
    INSERT INTO public.goal_monthly_targets (goal_id, month, frequency_per_week)
    SELECT g.id, ${month}::date, g.frequency_per_week
    FROM public.goals g
    JOIN public.profiles p ON p.id = g.user_id
    WHERE g.is_active
      AND (g.created_at AT TIME ZONE p.timezone)::date
          < (${month}::date + INTERVAL '1 month')::date
    ON CONFLICT (goal_id, month) DO NOTHING
  `;
}

// ------------------------------------------------------------
// Check-ins
// ------------------------------------------------------------
export async function logCheckin(
  memberId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const goalId = text(formData, "goal_id");
  const date = text(formData, "checkin_date");
  const note = text(formData, "note");
  const minutesRaw = text(formData, "duration_minutes");

  if (!UUID_RE.test(memberId) || !UUID_RE.test(goalId)) {
    return { ok: false, message: "Pick a goal." };
  }
  if (!isRealDate(date)) {
    return { ok: false, message: "Enter a valid date." };
  }
  if (note.length > 280) {
    return { ok: false, message: "Keep the note under 280 characters." };
  }
  let minutes: number | null = null;
  if (minutesRaw !== "") {
    minutes = Number(minutesRaw);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      return {
        ok: false,
        message: "Minutes must be a whole number from 1 to 1440.",
      };
    }
  }

  try {
    await sql.begin(async (tx) => {
      const [goal] = await tx<
        {
          is_active: boolean;
          start_date: string;
          today: string;
          earliest: string;
          month_locked: boolean;
        }[]
      >`
        SELECT g.is_active,
               (g.created_at AT TIME ZONE p.timezone)::date::text AS start_date,
               (now() AT TIME ZONE p.timezone)::date::text AS today,
               (date_trunc('month', now() AT TIME ZONE p.timezone)
                  - INTERVAL '1 month')::date::text AS earliest,
               EXISTS (SELECT 1 FROM public.monthly_prizes pr
                       WHERE pr.family_id = p.family_id
                         AND pr.month = date_trunc('month', ${date}::date)::date
               ) AS month_locked
        FROM public.goals g
        JOIN public.profiles p ON p.id = g.user_id
        WHERE g.id = ${goalId} AND g.user_id = ${memberId}
      `;
      if (!goal) throw new UserError("That goal doesn't belong to this member.");
      if (!goal.is_active) throw new UserError("That goal is paused. Resume it first.");
      if (date > goal.today) throw new UserError("You can't check in for a future date.");
      if (date < goal.start_date) {
        throw new UserError(`That's before the goal started (${goal.start_date}).`);
      }
      if (date < goal.earliest) {
        throw new UserError("Check-ins can go back to the start of last month, no further.");
      }
      if (goal.month_locked) {
        throw new UserError("That month's prize was already awarded, so it's closed.");
      }

      const month = `${date.slice(0, 7)}-01`;
      await ensureMonthSnapshot(tx, month);
      await tx`
        INSERT INTO public.checkins (goal_id, checkin_date, note, duration_minutes)
        VALUES (${goalId}, ${date}, ${note || null}, ${minutes})
      `;
    });
  } catch (err) {
    const code = pgErrorCode(err);
    if (code === PG_UNIQUE_VIOLATION) {
      return { ok: false, message: "Already checked in for that goal on that date." };
    }
    if (code === PG_CHECK_VIOLATION) {
      return { ok: false, message: "Minutes must be greater than zero." };
    }
    return fail(err);
  }

  revalidatePath("/", "layout");
  return { ok: true, message: `Checked in for ${date}.` };
}

export async function deleteCheckin(
  memberId: string,
  checkinId: string,
  _prev: ActionState,
): Promise<ActionState> {
  if (!UUID_RE.test(memberId) || !UUID_RE.test(checkinId)) {
    return { ok: false, message: "Check-in not found." };
  }
  try {
    const rows = await sql`
      DELETE FROM public.checkins c
      USING public.goals g, public.profiles p
      WHERE c.id = ${checkinId}
        AND g.id = c.goal_id
        AND g.user_id = ${memberId}
        AND p.id = g.user_id
        AND NOT EXISTS (SELECT 1 FROM public.monthly_prizes pr
                        WHERE pr.family_id = p.family_id
                          AND pr.month = date_trunc('month', c.checkin_date)::date)
      RETURNING c.id
    `;
    if (rows.length === 0) {
      return { ok: false, message: "Can't delete: the month is closed or the check-in is gone." };
    }
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Deleted." };
}

// ------------------------------------------------------------
// Goals
// ------------------------------------------------------------
export async function createGoal(
  memberId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = text(formData, "title");
  const category = text(formData, "category");
  const unit = text(formData, "unit");
  const frequency = Number(text(formData, "frequency_per_week"));

  if (!UUID_RE.test(memberId)) return { ok: false, message: "Member not found." };
  if (title.length < 2 || title.length > 80) {
    return { ok: false, message: "Give the goal a name (2 to 80 characters)." };
  }
  if (category.length > 40 || unit.length > 30) {
    return { ok: false, message: "Category or unit is too long." };
  }
  if (!Number.isInteger(frequency) || frequency < 1 || frequency > 7) {
    return { ok: false, message: "Times per week must be 1 to 7." };
  }

  try {
    await sql.begin(async (tx) => {
      const [member] = await tx<{ month: string }[]>`
        SELECT date_trunc('month', now() AT TIME ZONE p.timezone)::date::text AS month
        FROM public.profiles p
        WHERE p.id = ${memberId}
      `;
      if (!member) throw new UserError("Member not found.");
      await tx`
        INSERT INTO public.goals (user_id, title, category, frequency_per_week, unit)
        VALUES (${memberId}, ${title}, ${category || null}, ${frequency}, ${unit || null})
      `;
      // New goals count from the month they start, with a full-month target.
      await ensureMonthSnapshot(tx, member.month);
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Added "${title}".` };
}

export async function toggleGoal(
  memberId: string,
  goalId: string,
  _prev: ActionState,
): Promise<ActionState> {
  if (!UUID_RE.test(memberId) || !UUID_RE.test(goalId)) {
    return { ok: false, message: "Goal not found." };
  }
  let nowActive = false;
  try {
    await sql.begin(async (tx) => {
      const [goal] = await tx<{ is_active: boolean; month: string }[]>`
        UPDATE public.goals g
        SET is_active = NOT g.is_active
        FROM public.profiles p
        WHERE g.id = ${goalId}
          AND g.user_id = ${memberId}
          AND p.id = g.user_id
        RETURNING g.is_active,
                  date_trunc('month', now() AT TIME ZONE p.timezone)::date::text AS month
      `;
      if (!goal) throw new UserError("Goal not found.");
      nowActive = goal.is_active;
      if (goal.is_active) await ensureMonthSnapshot(tx, goal.month);
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: nowActive ? "Goal resumed." : "Goal paused." };
}

// ------------------------------------------------------------
// Monthly prize
// ------------------------------------------------------------
// Rule: the family member(s) with the highest completion rate win, as long
// as they checked in at least once. A tie means more than one winner row for
// the same prize. Runs in one
// transaction, so a prize is never saved without its winners.
export async function awardPrize(
  familyId: string,
  month: string,
  _prev: ActionState,
): Promise<ActionState> {
  if (!UUID_RE.test(familyId) || !MONTH_RE.test(month)) {
    return { ok: false, message: "Unknown family or month." };
  }

  let winners: string[] = [];
  try {
    await sql.begin(async (tx) => {
      const [check] = await tx<{ family_exists: boolean; ended: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM public.families WHERE id = ${familyId}) AS family_exists,
               (${month}::date + INTERVAL '1 month') <= current_date AS ended
      `;
      if (!check.family_exists) throw new UserError("Family not found.");
      if (!check.ended) throw new UserError("The month isn't over yet.");

      const [prize] = await tx<{ id: string }[]>`
        INSERT INTO public.monthly_prizes (family_id, month)
        VALUES (${familyId}, ${month})
        ON CONFLICT (family_id, month) DO NOTHING
        RETURNING id
      `;
      if (!prize) throw new UserError("This prize was already awarded.");

      const rows = await tx<{ full_name: string }[]>`
        WITH member_progress AS (${memberProgress(tx, familyId, month)}),
        ranked AS (
            SELECT id, full_name,
                   RANK() OVER (ORDER BY checkins::numeric / target DESC) AS place
            FROM member_progress
            WHERE target > 0
              AND checkins > 0   -- a 0% month wins nothing, even if everyone tied at 0
        ),
        inserted AS (
            INSERT INTO public.monthly_prize_winners (prize_id, user_id)
            SELECT ${prize.id}, id FROM ranked WHERE place = 1
            RETURNING user_id
        )
        SELECT r.full_name
        FROM inserted i
        JOIN ranked r ON r.id = i.user_id
        ORDER BY r.full_name
      `;
      if (rows.length === 0) {
        throw new UserError("No one in this family checked in that month, so there is no winner.");
      }
      winners = rows.map((r) => r.full_name);
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Awarded to ${winners.join(" and ")}.` };
}
