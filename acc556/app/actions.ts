"use server";

import { revalidatePath } from "next/cache";
import {
  PG_CHECK_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
  sql,
} from "@/lib/db";
import { memberProgress } from "@/lib/queries";

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
    // Look up the goal and the member's "today" in one query.
    const [goal] = await sql<
      { start_date: string; end_date: string | null; today: string; yesterday: string }[]
    >`
      SELECT g.start_date::text,
             g.end_date::text,
             (now() AT TIME ZONE p.timezone)::date::text       AS today,
             ((now() AT TIME ZONE p.timezone)::date - 1)::text AS yesterday
      FROM public.goals g
      JOIN public.profiles p ON p.id = g.user_id
      WHERE g.id = ${goalId} AND g.user_id = ${memberId}
    `;
    if (!goal) return { ok: false, message: "That goal doesn't belong to this member." };
    // One simple rule: you can log today, or catch up on yesterday.
    if (date !== goal.today && date !== goal.yesterday) {
      return { ok: false, message: "Check-ins can only be logged for today or yesterday." };
    }
    if (date < goal.start_date) {
      return { ok: false, message: `That goal starts on ${goal.start_date}.` };
    }
    if (goal.end_date !== null && date > goal.end_date) {
      return { ok: false, message: "That goal has ended." };
    }

    await sql`
      INSERT INTO public.checkins (goal_id, checkin_date, note, duration_minutes)
      VALUES (${goalId}, ${date}, ${note || null}, ${minutes})
    `;
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
    // Same window as logging: only today's or yesterday's check-ins can be deleted.
    const rows = await sql`
      DELETE FROM public.checkins c
      USING public.goals g, public.profiles p
      WHERE c.id = ${checkinId}
        AND g.id = c.goal_id
        AND g.user_id = ${memberId}
        AND p.id = g.user_id
        AND c.checkin_date >= (now() AT TIME ZONE p.timezone)::date - 1
      RETURNING c.id
    `;
    if (rows.length === 0) {
      return { ok: false, message: "Only today's or yesterday's check-ins can be deleted." };
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
    // The goal starts counting today, in the member's own timezone.
    const rows = await sql`
      INSERT INTO public.goals (user_id, title, category, frequency_per_week, unit, start_date)
      SELECT p.id, ${title}, ${category || null}, ${frequency}, ${unit || null},
             (now() AT TIME ZONE p.timezone)::date
      FROM public.profiles p
      WHERE p.id = ${memberId}
      RETURNING id
    `;
    if (rows.length === 0) return { ok: false, message: "Member not found." };
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Added "${title}".` };
}

// Ending a goal sets end_date to today. It still counts for this month (and
// every earlier month), so history stays the same. There is no "resume":
// to change a goal, end it and add a new one.
export async function endGoal(
  memberId: string,
  goalId: string,
  _prev: ActionState,
): Promise<ActionState> {
  if (!UUID_RE.test(memberId) || !UUID_RE.test(goalId)) {
    return { ok: false, message: "Goal not found." };
  }
  try {
    const rows = await sql`
      UPDATE public.goals g
      SET end_date = GREATEST((now() AT TIME ZONE p.timezone)::date, g.start_date)
      FROM public.profiles p
      WHERE g.id = ${goalId}
        AND g.user_id = ${memberId}
        AND p.id = g.user_id
        AND g.end_date IS NULL
      RETURNING g.id
    `;
    if (rows.length === 0) return { ok: false, message: "That goal has already ended." };
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Goal ended." };
}

// A goal with no check-ins can be deleted outright (for example, one added by
// mistake). A goal with check-ins can only be ended, so its history stays.
export async function deleteGoal(
  memberId: string,
  goalId: string,
  _prev: ActionState,
): Promise<ActionState> {
  if (!UUID_RE.test(memberId) || !UUID_RE.test(goalId)) {
    return { ok: false, message: "Goal not found." };
  }
  try {
    const rows = await sql`
      DELETE FROM public.goals g
      WHERE g.id = ${goalId}
        AND g.user_id = ${memberId}
        AND NOT EXISTS (SELECT 1 FROM public.checkins c WHERE c.goal_id = g.id)
      RETURNING g.id
    `;
    if (rows.length === 0) {
      return { ok: false, message: "Goals with check-ins can't be deleted. End it instead." };
    }
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Goal deleted." };
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
