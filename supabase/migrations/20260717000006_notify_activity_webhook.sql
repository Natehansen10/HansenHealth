-- Phase 5: wires the already-deployed notify-activity Edge Function up to
-- fire on every new checkin / reaction / comment, via AFTER INSERT triggers
-- rather than Supabase's dashboard-configured Database Webhooks UI (this
-- keeps the wiring in a migration instead of undeclared dashboard state,
-- consistent with how monthly-target-snapshot's cron job is wired in
-- 20260717000001_monthly_target_snapshot_cron.sql).
--
-- Same Vault secret reuse as the cron migration: 'service_role_key' already
-- exists in Supabase Vault and is live for that job, so it's reused here
-- rather than provisioning a new secret.
--
-- pg_net fire-and-forget confirmation (see report below for full detail):
-- net.http_post() only *queues* the request into pg_net's internal request
-- table and returns a bigint request id immediately -- it does not block on
-- the HTTP round trip. Actual delivery happens asynchronously via a pg_net
-- background worker. This means a slow or failing notify-activity call can
-- never hang or fail the triggering INSERT transaction on checkins,
-- reactions, or comments.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- Trigger function
-- ---------------------------------------------------------------------
--
-- security definer is required because this function reads
-- vault.decrypted_secrets, which normal authenticated/anon roles cannot
-- read directly. Despite security definer + reading a secret, this
-- function is NOT abusable by a client for secret exfiltration:
--
--   1. It is declared `returns trigger`. Postgres trigger functions can
--      only be invoked by the trigger machinery on an actual table event
--      -- `select notify_activity_webhook()` from SQL (e.g. via PostgREST
--      RPC or psql) is rejected outright with
--      "trigger functions can only be called as triggers", before the
--      function body ever runs. There is no return value or side channel
--      that could leak the secret even if this restriction didn't exist:
--      the function returns `new` (the row itself, already visible to
--      whoever inserted it) and never surfaces the header value anywhere
--      a caller could observe it.
--   2. It is attached via CREATE TRIGGER to exactly three tables below
--      (checkins, reactions, comments), each already covered by existing
--      RLS insert policies scoped to the caller's own rows
--      (insert own checkins / manage own reactions / manage own comments).
--      A user can only trigger this function by inserting a row they were
--      already allowed to insert -- it is not attached broadly to any
--      table a client can write arbitrary/unscoped data into.
--   3. execute is explicitly revoked from PUBLIC/anon/authenticated below
--      as belt-and-suspenders, even though (1) already makes direct
--      invocation impossible.
create or replace function notify_activity_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_key text;
  payload jsonb;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', TG_TABLE_NAME,
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', null
  );

  -- Fire-and-forget: net.http_post queues the request and returns
  -- immediately (see migration header comment). Deliberately not
  -- capturing/inspecting the returned request id -- this trigger must
  -- never fail or block the original insert because of the notification
  -- side effect.
  perform net.http_post(
    url := 'https://krcuyqsmahavlahkpoyc.supabase.co/functions/v1/notify-activity',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', service_key
    ),
    body := payload
  );

  return new;
end;
$$;

-- Defense-in-depth: no ordinary role should be able to execute this
-- function directly, even though its `returns trigger` shape already makes
-- direct invocation impossible at the Postgres level.
revoke all on function notify_activity_webhook() from public;
revoke all on function notify_activity_webhook() from anon;
revoke all on function notify_activity_webhook() from authenticated;

-- ---------------------------------------------------------------------
-- Attach to the three tables that should notify on insert -- nothing else.
-- ---------------------------------------------------------------------

drop trigger if exists trg_notify_activity_checkins on checkins;

create trigger trg_notify_activity_checkins
  after insert on checkins
  for each row
  execute function notify_activity_webhook();

drop trigger if exists trg_notify_activity_reactions on reactions;

create trigger trg_notify_activity_reactions
  after insert on reactions
  for each row
  execute function notify_activity_webhook();

drop trigger if exists trg_notify_activity_comments on comments;

create trigger trg_notify_activity_comments
  after insert on comments
  for each row
  execute function notify_activity_webhook();
