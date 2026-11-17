-- ACC 556: close the public API on the project tables.
-- Run after 01_schema_and_data.sql (re-run it any time you re-run 01).
--
-- WHY: Supabase publishes every table in the public schema through an HTTP API that anyone with the
-- project's public (anon) key can call. Tables created in the SQL Editor start with Row Level Security
-- OFF, which means that API could read and change every row.
--
-- This app never uses that API. The browser never talks to the database; the Next.js server connects
-- directly with the database password (DATABASE_URL), as the table owner. So the safe setting is:
--   1. Turn on Row Level Security with no policies: the API roles see zero rows.
--   2. Revoke the API roles' privileges outright, including on the view (views skip RLS by default).
-- The table owner (the app's connection) is not affected by either step.

ALTER TABLE public.families              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_prizes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_prize_winners ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.families, public.profiles, public.goals,
              public.checkins, public.monthly_prizes, public.monthly_prize_winners,
              public.v_goal_monthly_targets
FROM anon, authenticated;

-- Proof: every row should say rls_enabled = true and api_can_read = false.
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') AS api_can_read
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('families', 'profiles', 'goals', 'checkins',
                    'monthly_prizes', 'monthly_prize_winners', 'v_goal_monthly_targets')
ORDER BY c.relname;
