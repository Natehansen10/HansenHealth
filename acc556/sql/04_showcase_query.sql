-- ACC 556: the query for the Phase 4 video ("one SQL query you're proud of").
-- Every family member's completion rate for every month, their place inside their family,
-- and how much they improved or slipped since the month before.
--
-- How it works, step by step:
--   goal_month   One row per goal per month. The target comes from the view; LEFT JOIN on check-ins keeps
--                goals with zero check-ins, so skipping a goal still counts against you.
--   member_month Adds a member's goals together for each month (a member with 2 goals = 1 row).
--   final SELECT Two window functions, which look at other rows without collapsing them:
--                RANK() ranks members inside their own family and month. Ties share a place.
--                LAG()  reads the same member's rate from the previous month, to show the change.
-- Note: October check-ins in the sample data stop on Oct 20, so October rates are lower.

WITH goal_month AS (
    SELECT g.user_id,
           t.goal_id,
           t.month,
           t.target,
           COUNT(c.id) AS checkins
    FROM public.v_goal_monthly_targets t
    JOIN public.goals g ON g.id = t.goal_id
    LEFT JOIN public.checkins c
           ON c.goal_id = t.goal_id
          AND c.checkin_date >= t.month
          AND c.checkin_date <  (t.month + INTERVAL '1 month')::date
    GROUP BY g.user_id, t.goal_id, t.month, t.target
),
member_month AS (
    SELECT p.id AS user_id,
           p.full_name,
           f.name AS family,
           gm.month,
           SUM(gm.checkins) AS checkins,
           SUM(gm.target)   AS target,
           ROUND(100.0 * SUM(gm.checkins) / SUM(gm.target), 1) AS completion_pct
    FROM goal_month gm
    JOIN public.profiles p ON p.id = gm.user_id
    JOIN public.families f ON f.id = p.family_id
    GROUP BY p.id, p.full_name, f.name, gm.month
)
SELECT family,
       to_char(month, 'Mon YYYY') AS month_label,
       full_name,
       checkins,
       target,
       completion_pct,
       RANK() OVER (PARTITION BY family, month
                    ORDER BY checkins::numeric / target DESC) AS place_in_family,
       completion_pct - LAG(completion_pct) OVER (PARTITION BY user_id
                                                  ORDER BY month) AS change_vs_last_month
FROM member_month
ORDER BY family, month, place_in_family, full_name;
