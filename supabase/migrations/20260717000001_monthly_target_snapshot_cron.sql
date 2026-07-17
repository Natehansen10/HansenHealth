-- Schedules monthly-target-snapshot to run daily at 00:10 UTC. Runs daily
-- (not just on the 1st) as a small boundary-tolerance measure: if a run is
-- ever missed on the 1st (deploy issue, transient failure), the next day's
-- run still catches any goal still missing a target for the current month.
-- The function itself is idempotent (skips goals that already have a
-- target row for the month), so extra daily runs are harmless.
--
-- Reads the service role key from Supabase Vault rather than embedding it
-- in this migration file. Before this job can succeed, add a secret named
-- 'service_role_key' via Supabase Dashboard -> Project Settings -> Vault,
-- containing the project's service_role key.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'monthly-target-snapshot-daily',
  '10 0 * * *',
  $$
  select net.http_post(
    url := 'https://krcuyqsmahavlahkpoyc.supabase.co/functions/v1/monthly-target-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apiKey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
