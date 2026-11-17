-- ACC 556: integrity checks. Run after 01_schema_and_data.sql. Each check should return the expected result.
-- Run them one at a time in the Supabase SQL Editor (it shows only the last result).
--
-- Phase 4: goals now have start_date and end_date, so CHECK 2 compares against start_date and
-- CHECK 3 is new. CHECK 5 (the target view) now reads goals directly.

-- CHECK 1: Check-ins with no matching goal. Expected: 0 rows.
SELECT c.id
FROM public.checkins c
LEFT JOIN public.goals g ON g.id = c.goal_id
WHERE g.id IS NULL;

-- CHECK 2: Check-ins dated before their goal started. Expected: 0 rows.
SELECT c.id, c.checkin_date, g.start_date
FROM public.checkins c
JOIN public.goals g ON g.id = c.goal_id
WHERE c.checkin_date < g.start_date;

-- CHECK 3: Check-ins dated after their goal ended. Expected: 0 rows.
SELECT c.id, c.checkin_date, g.end_date
FROM public.checkins c
JOIN public.goals g ON g.id = c.goal_id
WHERE c.checkin_date > g.end_date;

-- CHECK 4: Prize winners who are not in the family that was awarded the prize. Expected: 0 rows.
SELECT pr.id AS prize_id, w.user_id
FROM public.monthly_prize_winners w
JOIN public.monthly_prizes pr ON pr.id = w.prize_id
JOIN public.profiles p ON p.id = w.user_id
WHERE p.family_id IS DISTINCT FROM pr.family_id;

-- CHECK 5: The calculated target. Expected: Dana's meditation shows 13 for September (old 3-per-week goal,
-- ended Sep 30), then 18 for October and 17 for November (new 4-per-week goal).
SELECT g.title, g.start_date, g.end_date, t.month, t.frequency_per_week, t.days_in_month, t.target
FROM public.v_goal_monthly_targets t
JOIN public.goals g ON g.id = t.goal_id
WHERE g.title = 'Evening meditation'
ORDER BY t.month;

-- CHECK 6: September completion rate per member, with the prize winners marked.
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
