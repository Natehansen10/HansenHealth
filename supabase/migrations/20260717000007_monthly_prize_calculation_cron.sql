-- Schedules monthly-prize-calculation to run once a month, on the 1st at
-- 00:15 UTC (five minutes after monthly-target-snapshot's daily 00:10 UTC
-- run, so that month's own target snapshot has had a chance to run first --
-- though note this function evaluates the PRIOR month, whose targets would
-- have been snapshotted long before this run regardless).
--
-- Only scheduled on the 1st (not daily like monthly-target-snapshot) since
-- there's no boundary-tolerance concern here: the function always computes
-- "last calendar month" relative to whenever it runs, so a run on the 2nd
-- or 3rd would silently evaluate the wrong month if invoked outside of the
-- 1st. The function is idempotent (upserts on the monthly_prizes unique
-- constraint), so a manual re-invocation for testing/backfill is safe.
--
-- Reads the service role key from Supabase Vault rather than embedding it
-- in this migration file (same 'service_role_key' secret already used by
-- monthly-target-snapshot's cron job).
select cron.schedule(
  'monthly-prize-calculation-monthly',
  '15 0 1 * *',
  $$
  select net.http_post(
    url := 'https://krcuyqsmahavlahkpoyc.supabase.co/functions/v1/monthly-prize-calculation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apiKey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
