import "server-only";
import { connection } from "next/server";
import type postgres from "postgres";
import { sql } from "./db";

// Every read the app makes lives in this file, as plain SQL.
// Dates come back as text (YYYY-MM-DD) and counts as int, so nothing here
// depends on the server's local timezone or on JavaScript's Date parsing.

// Accepts the shared pool or an open transaction, so the same SQL can be
// read on a page and reused inside the prize-award transaction.
export type Db = postgres.Sql | postgres.TransactionSql;

// ------------------------------------------------------------
// Shared building block: one member's progress for one month.
// ------------------------------------------------------------
// For every goal that has a target row that month (the view calculates the
// target), count the check-ins that fall inside the month, then add them up
// per member. LEFT JOIN on checkins keeps goals with zero check-ins in the
// total, so a skipped goal still counts against you.
//
// Used by both the leaderboard and the prize award, so the number you see is
// the number that decides the prize.
export function memberProgress(db: Db, familyId: string, month: string) {
  const q = db as postgres.Sql;
  return q`
    SELECT p.id,
           p.full_name,
           p.role,
           COUNT(gp.goal_id)::int                 AS goals,
           COALESCE(SUM(gp.checkins), 0)::int     AS checkins,
           COALESCE(SUM(gp.target), 0)::int       AS target
    FROM public.profiles p
    LEFT JOIN (
        SELECT g.user_id,
               t.goal_id,
               t.target,
               COUNT(c.id) AS checkins
        FROM public.v_goal_monthly_targets t
        JOIN public.goals g ON g.id = t.goal_id
        LEFT JOIN public.checkins c
               ON c.goal_id = t.goal_id
              AND c.checkin_date >= t.month
              AND c.checkin_date <  (t.month + INTERVAL '1 month')::date
        WHERE t.month = ${month}
        GROUP BY g.user_id, t.goal_id, t.target
    ) gp ON gp.user_id = p.id
    WHERE p.family_id = ${familyId}
    GROUP BY p.id, p.full_name, p.role
  `;
}

// ------------------------------------------------------------
// Navigation data
// ------------------------------------------------------------
export type Family = { id: string; name: string; member_count: number };

export async function getFamilies(): Promise<Family[]> {
  await connection();
  return sql<Family[]>`
    SELECT f.id, f.name, COUNT(p.id)::int AS member_count
    FROM public.families f
    LEFT JOIN public.profiles p ON p.family_id = f.id
    GROUP BY f.id, f.name
    ORDER BY f.name
  `;
}

// Months in which at least one goal was running, newest first.
export async function getMonths(): Promise<string[]> {
  await connection();
  const rows = await sql<{ month: string }[]>`
    SELECT DISTINCT month::text AS month
    FROM public.v_goal_monthly_targets
    ORDER BY month DESC
  `;
  return rows.map((r) => r.month);
}

export type DbStats = { members: number; goals: number; checkins: number };

export async function getDbStats(): Promise<DbStats> {
  await connection();
  const [row] = await sql<DbStats[]>`
    SELECT (SELECT COUNT(*) FROM public.profiles)::int AS members,
           (SELECT COUNT(*) FROM public.goals)::int    AS goals,
           (SELECT COUNT(*) FROM public.checkins)::int AS checkins
  `;
  return row;
}

// ------------------------------------------------------------
// Leaderboard (the win condition)
// ------------------------------------------------------------
export type LeaderboardRow = {
  id: string;
  full_name: string;
  role: string;
  goals: number;
  checkins: number;
  target: number;
  pct: number | null;
  place: number | null;
  won: boolean;
};

// RANK() is a window function: it numbers members by completion rate inside
// the family, and gives tied members the same place (two 1st places, then 3rd).
// Members with no target that month get no place instead of a fake 0%.
export const LEADERBOARD_SQL_TEXT = `WITH member_progress AS (
    -- one row per family member: check-ins and target for the month
    -- (see memberProgress in lib/queries.ts)
)
SELECT m.*,
       ROUND(100.0 * m.checkins / NULLIF(m.target, 0), 1) AS pct,
       CASE WHEN m.target > 0 THEN
           RANK() OVER (PARTITION BY m.target > 0
                        ORDER BY m.checkins::numeric / NULLIF(m.target, 0) DESC)
       END AS place,
       EXISTS (SELECT 1
               FROM monthly_prize_winners w
               JOIN monthly_prizes pr ON pr.id = w.prize_id
               WHERE pr.family_id = $family AND pr.month = $month
                 AND w.user_id = m.id) AS won
FROM member_progress m
ORDER BY place NULLS LAST, m.full_name;`;

export async function getLeaderboard(
  familyId: string,
  month: string,
): Promise<LeaderboardRow[]> {
  await connection();
  return sql<LeaderboardRow[]>`
    WITH member_progress AS (${memberProgress(sql, familyId, month)})
    SELECT m.*,
           ROUND(100.0 * m.checkins / NULLIF(m.target, 0), 1)::float8 AS pct,
           (CASE WHEN m.target > 0 THEN
               RANK() OVER (PARTITION BY m.target > 0
                            ORDER BY m.checkins::numeric / NULLIF(m.target, 0) DESC)
            END)::int AS place,
           EXISTS (SELECT 1
                   FROM public.monthly_prize_winners w
                   JOIN public.monthly_prizes pr ON pr.id = w.prize_id
                   WHERE pr.family_id = ${familyId}
                     AND pr.month = ${month}
                     AND w.user_id = m.id) AS won
    FROM member_progress m
    ORDER BY place NULLS LAST, m.full_name
  `;
}

export type GoalBreakdownRow = {
  user_id: string;
  title: string;
  unit: string | null;
  frequency_per_week: number;
  target: number;
  checkins: number;
};

// Per-goal detail under each member on the leaderboard.
export async function getGoalBreakdown(
  familyId: string,
  month: string,
): Promise<GoalBreakdownRow[]> {
  await connection();
  return sql<GoalBreakdownRow[]>`
    SELECT g.user_id,
           g.title,
           g.unit,
           t.frequency_per_week,
           t.target,
           COUNT(c.id)::int AS checkins
    FROM public.v_goal_monthly_targets t
    JOIN public.goals g    ON g.id = t.goal_id
    JOIN public.profiles p ON p.id = g.user_id
    LEFT JOIN public.checkins c
           ON c.goal_id = t.goal_id
          AND c.checkin_date >= t.month
          AND c.checkin_date <  (t.month + INTERVAL '1 month')::date
    WHERE t.month = ${month}
      AND p.family_id = ${familyId}
    GROUP BY g.user_id, g.title, g.unit, t.frequency_per_week, t.target, g.created_at
    ORDER BY g.created_at
  `;
}

export type PrizeStatus = {
  awarded_at: string | null;
  month_has_ended: boolean;
};

export async function getPrizeStatus(
  familyId: string,
  month: string,
): Promise<PrizeStatus> {
  await connection();
  const [row] = await sql<PrizeStatus[]>`
    SELECT (SELECT to_char(pr.awarded_at AT TIME ZONE 'UTC', 'Mon FMDD, YYYY')
            FROM public.monthly_prizes pr
            WHERE pr.family_id = ${familyId} AND pr.month = ${month}) AS awarded_at,
           (${month}::date + INTERVAL '1 month') <= current_date AS month_has_ended
  `;
  return row;
}

// ------------------------------------------------------------
// Members
// ------------------------------------------------------------
export type MemberListRow = {
  id: string;
  full_name: string;
  role: string;
  family_name: string | null;
  active_goals: number;
  total_checkins: number;
  last_checkin: string | null;
  prizes_won: number;
};

export async function getMembers(): Promise<MemberListRow[]> {
  await connection();
  return sql<MemberListRow[]>`
    SELECT p.id,
           p.full_name,
           p.role,
           f.name AS family_name,
           (SELECT COUNT(*) FROM public.goals g
             WHERE g.user_id = p.id AND g.end_date IS NULL)::int AS active_goals,
           (SELECT COUNT(*) FROM public.checkins c
             JOIN public.goals g ON g.id = c.goal_id
             WHERE g.user_id = p.id)::int AS total_checkins,
           (SELECT MAX(c.checkin_date) FROM public.checkins c
             JOIN public.goals g ON g.id = c.goal_id
             WHERE g.user_id = p.id)::text AS last_checkin,
           (SELECT COUNT(*) FROM public.monthly_prize_winners w
             WHERE w.user_id = p.id)::int AS prizes_won
    FROM public.profiles p
    LEFT JOIN public.families f ON f.id = p.family_id
    ORDER BY f.name NULLS LAST, p.full_name
  `;
}

export type Member = {
  id: string;
  full_name: string;
  role: string;
  timezone: string;
  family_id: string | null;
  family_name: string | null;
  today: string;
  yesterday: string;
};

export async function getMember(id: string): Promise<Member | undefined> {
  await connection();
  const [row] = await sql<Member[]>`
    SELECT p.id,
           p.full_name,
           p.role,
           p.timezone,
           f.id   AS family_id,
           f.name AS family_name,
           -- "today" in the member's own timezone, not the server's
           (now() AT TIME ZONE p.timezone)::date::text AS today,
           ((now() AT TIME ZONE p.timezone)::date - 1)::text AS yesterday
    FROM public.profiles p
    LEFT JOIN public.families f ON f.id = p.family_id
    WHERE p.id = ${id}
  `;
  return row;
}

export type MemberGoal = {
  id: string;
  title: string;
  category: string | null;
  unit: string | null;
  frequency_per_week: number;
  start_date: string;
  end_date: string | null;
  month_target: number | null;
  month_checkins: number;
  total_checkins: number;
};

export async function getMemberGoals(
  memberId: string,
  month: string,
): Promise<MemberGoal[]> {
  await connection();
  return sql<MemberGoal[]>`
    SELECT g.id,
           g.title,
           g.category,
           g.unit,
           g.frequency_per_week,
           g.start_date::text,
           g.end_date::text,
           t.target AS month_target,
           (SELECT COUNT(*) FROM public.checkins c
             WHERE c.goal_id = g.id
               AND c.checkin_date >= ${month}::date
               AND c.checkin_date <  (${month}::date + INTERVAL '1 month')::date
           )::int AS month_checkins,
           (SELECT COUNT(*) FROM public.checkins c WHERE c.goal_id = g.id)::int AS total_checkins
    FROM public.goals g
    LEFT JOIN public.v_goal_monthly_targets t
           ON t.goal_id = g.id AND t.month = ${month}
    WHERE g.user_id = ${memberId}
    ORDER BY (g.end_date IS NULL) DESC, g.start_date, g.created_at
  `;
}

export type MemberCheckin = {
  id: string;
  checkin_date: string;
  note: string | null;
  duration_minutes: number | null;
  goal_title: string;
  can_delete: boolean;
};

// Only today's and yesterday's check-ins can be deleted (same window as logging).
export async function getMemberCheckins(
  memberId: string,
  limit = 30,
): Promise<MemberCheckin[]> {
  await connection();
  return sql<MemberCheckin[]>`
    SELECT c.id,
           c.checkin_date::text AS checkin_date,
           c.note,
           c.duration_minutes,
           g.title AS goal_title,
           c.checkin_date >= (now() AT TIME ZONE p.timezone)::date - 1 AS can_delete
    FROM public.checkins c
    JOIN public.goals g    ON g.id = c.goal_id
    JOIN public.profiles p ON p.id = g.user_id
    WHERE g.user_id = ${memberId}
    ORDER BY c.checkin_date DESC, c.created_at DESC
    LIMIT ${limit}
  `;
}

export async function getMemberPrizeMonths(memberId: string): Promise<string[]> {
  await connection();
  const rows = await sql<{ month: string }[]>`
    SELECT pr.month::text AS month
    FROM public.monthly_prize_winners w
    JOIN public.monthly_prizes pr ON pr.id = w.prize_id
    WHERE w.user_id = ${memberId}
    ORDER BY pr.month DESC
  `;
  return rows.map((r) => r.month);
}
