-- ACC 556: integrity checks. Run after 01_schema_and_data.sql. Each check should return the expected result.
-- Run them one at a time in the Supabase SQL Editor (it shows only the last result).
--
-- Changes from the Phase 3 version:
--   CHECK 2 now compares dates in the goal owner's timezone. The old version cast created_at to a date in UTC,
--           so a goal made at 6:05 PM Mountain on Oct 1 looked like it started Oct 2, and Sam's Oct 1 check-in
--           was flagged by mistake.
--   CHECK 5 now LEFT JOINs check-ins, so a goal with zero check-ins still counts against the member.
--           (Same results on the sample data, but the old version would overstate a member who skipped a goal.)

-- CHECK 1: Check-ins with no matching goal. Expected: 0 rows.
SELECT c.id
FROM public.checkins c
LEFT JOIN public.goals g ON g.id = c.goal_id
WHERE g.id IS NULL;

-- CHECK 2: Check-ins dated before the goal was created, in the owner's own timezone. Expected: 0 rows.
SELECT c.id, c.checkin_date, (g.created_at AT TIME ZONE p.timezone)::date AS goal_start_local
FROM public.checkins c
JOIN public.goals g    ON g.id = c.goal_id
JOIN public.profiles p ON p.id = g.user_id
WHERE c.checkin_date < (g.created_at AT TIME ZONE p.timezone)::date;

-- CHECK 3: Prize winners who are not in the family that was awarded the prize. Expected: 0 rows.
SELECT pr.id AS prize_id, w.user_id
FROM public.monthly_prize_winners w
JOIN public.monthly_prizes pr ON pr.id = w.prize_id
JOIN public.profiles p ON p.id = w.user_id
WHERE p.family_id IS DISTINCT FROM pr.family_id;

-- CHECK 4: The calculated target. Expected: Dana's meditation goal shows 13 for September and 18 for October.
SELECT g.title, t.month, t.frequency_per_week, t.days_in_month, t.target
FROM public.v_goal_monthly_targets t
JOIN public.goals g ON g.id = t.goal_id
WHERE g.title = 'Evening meditation'
ORDER BY t.month;

-- CHECK 5: September completion rate per member, with the prize winners marked.
-- Expected: Cole (Hansen), Ngozi and Amara (Clark, a tie), and Diego (Davis) show won_prize = true.
SELECT f.name AS family,
       p.full_name,
       SUM(done.checkins) AS september_checkins,
       SUM(t.target) AS september_target,
       ROUND(100.0 * SUM(done.checkins) / SUM(t.target), 1) AS completion_pct,
       BOOL_OR(w.user_id IS NOT NULL) AS won_prize
FROM public.profiles p
JOIN public.families f ON f.id = p.family_id
JOIN public.goals g ON g.user_id = p.id
JOIN public.v_goal_monthly_targets t ON t.goal_id = g.id AND t.month = DATE '2026-09-01'
CROSS JOIN LATERAL (
    SELECT COUNT(*) AS checkins
    FROM public.checkins c
    WHERE c.goal_id = g.id
      AND c.checkin_date >= DATE '2026-09-01' AND c.checkin_date < DATE '2026-10-01'
) done
LEFT JOIN public.monthly_prizes pr ON pr.family_id = f.id AND pr.month = DATE '2026-09-01'
LEFT JOIN public.monthly_prize_winners w ON w.prize_id = pr.id AND w.user_id = p.id
GROUP BY f.name, p.full_name
ORDER BY f.name, completion_pct DESC;
