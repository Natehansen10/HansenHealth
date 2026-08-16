-- Phase 7 (Polish & launch) — personal health log schema.
--
-- This is a DELIBERATELY SEPARATE system from goals/checkins. Those are the
-- family exercise-goal game: family-visible by design, month targets owned by
-- Edge Functions, prize logic on top. What lands here is a *personal health
-- log*: body metrics, vitals, sleep, activity counts, and user-defined
-- metrics. Nothing here feeds goal_monthly_targets, monthly_prizes, or
-- aggregatePercent, and nothing here is family-visible by default.
--
-- Three tables + two profile columns:
--   1. health_logs             — one row per user per day, all built-in
--                                metrics as nullable columns
--   2. personal_metrics        — a user-defined trackable metric
--                                (name/unit/target/frequency)
--   3. personal_metric_entries — dated values for a personal_metric
--   4. profiles.health_visibility — 'private' (default) | 'family'
--   5. profiles.weight_unit       — display-only label, see note below
--
-- Idempotent throughout (create ... if not exists / add column if not
-- exists / drop policy if exists) so this can be re-run safely.

-- ---------------------------------------------------------------------
-- 0. PROFILES: health sharing preference + weight unit label
-- ---------------------------------------------------------------------
-- health_visibility is the single switch that governs read access to ALL
-- three tables below. Default 'private' — opposite of checkins, which are
-- family-visible with no opt-out. A user who flips this to 'family' shares
-- their whole health log (built-in metrics AND personal metrics) with their
-- own family; there is intentionally no per-metric or per-row granularity,
-- because a partial-sharing model multiplies the RLS surface for a
-- household-sized app that does not need it.
alter table profiles
  add column if not exists health_visibility text not null default 'private';

-- weight_unit is a DISPLAY LABEL ONLY. This app has no unit-conversion
-- logic anywhere by standing decision (see the `distance` column note in
-- 20260717000008) — a stored weight of 180 is 180 in whatever unit the user
-- picked, and switching the unit re-labels the axis without touching a
-- single stored value. Do not add conversion on top of this column.
alter table profiles
  add column if not exists weight_unit text not null default 'lb';

-- Constraints added separately from the column so re-running the migration
-- against a table that already has the columns still converges.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_health_visibility_check'
  ) then
    alter table profiles
      add constraint profiles_health_visibility_check
      check (health_visibility in ('private', 'family'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_weight_unit_check'
  ) then
    alter table profiles
      add constraint profiles_weight_unit_check
      check (weight_unit in ('lb', 'kg'));
  end if;
end $$;

-- Trigger interaction check (per project convention, verified not assumed):
-- prevent_profiles_self_escalation() (20260717000005) raises only when
-- new.role or new.family_id differ from old. It does not reference
-- health_visibility or weight_unit, so a client-side
--   update profiles set health_visibility = 'family' where id = auth.uid()
-- passes the trigger, and passes the column-agnostic "update own profile"
-- policy (using/with check id = auth.uid()). Both columns are self-service
-- writable with no policy change needed — which is correct: a user deciding
-- who sees their own health data is exactly the kind of thing they should
-- be able to change unilaterally.

-- ---------------------------------------------------------------------
-- 1. Visibility helper
-- ---------------------------------------------------------------------
-- Security definer so the profiles lookup inside it doesn't re-enter
-- profiles' own RLS policy — same reason current_family_id()
-- (20260713000001) is security definer. search_path is pinned so a caller
-- can't shadow `profiles` or `current_family_id` with something of their
-- own.
--
-- Returns true when the caller is the owner, or when the owner is in the
-- caller's family AND has opted into family sharing. Note that a null
-- current_family_id() (caller not yet in a family) makes the family branch
-- null -> false rather than true, so a family-less user sees only their own
-- rows.
create or replace function health_owner_visible_to_me(owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    owner_id = auth.uid()
    or exists (
      select 1
      from profiles p
      where p.id = owner_id
        and p.family_id = current_family_id()
        and p.health_visibility = 'family'
    );
$$;

-- ---------------------------------------------------------------------
-- 2. HEALTH_LOGS — one row per user per day
-- ---------------------------------------------------------------------
-- Column-per-metric on a single daily row rather than a tall
-- (user, date, metric_name, value) table. The unified log form writes all
-- of these together for "today", and every read is "the last N days of one
-- or more metrics for one user" — both of which are one row-range scan
-- here versus a pivot there. Adding a new built-in metric is an
-- `add column`, which is cheap and rare; a user who wants something not on
-- this list uses personal_metrics instead.
--
-- Every metric is nullable: a day where you only logged steps is a valid
-- row with eight nulls. The check constraints are deliberately wide sanity
-- bounds (catching a transposed digit or a units mixup), not clinical
-- ranges — this is a family app, not a medical device, and a real 39kg
-- weight or a real 210 systolic must both still be recordable.
--
-- log_date is a plain date supplied by the caller, which the app derives
-- from todayInTimezone(profiles.timezone) — never a server-side now()
-- default, since "today" is per-user here exactly as it is for checkins.
create table if not exists health_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null,
  weight numeric(6,2) check (weight > 0 and weight <= 2000),
  body_fat_percent numeric(4,1) check (body_fat_percent >= 0 and body_fat_percent <= 100),
  systolic int check (systolic between 40 and 300),
  diastolic int check (diastolic between 20 and 250),
  resting_heart_rate int check (resting_heart_rate between 20 and 250),
  sleep_hours numeric(4,2) check (sleep_hours >= 0 and sleep_hours <= 24),
  sleep_quality int check (sleep_quality between 1 and 5),
  steps int check (steps >= 0 and steps <= 500000),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- Primary read pattern: "this user's last N days", newest first.
create index if not exists idx_health_logs_user_date
  on health_logs (user_id, log_date desc);

-- ---------------------------------------------------------------------
-- 3. PERSONAL_METRICS — user-defined trackable metric
-- ---------------------------------------------------------------------
-- IMPORTANT — target_value here is NOT the same concept as
-- goal_monthly_targets.target, and this is not a loophole in the "month
-- targets are computed only by Edge Functions" rule. That rule exists
-- because a family goal's monthly target is derived math (frequency x weeks
-- in month, blended on frequency change) that feeds prize eligibility, so
-- it must have exactly one authority. personal_metrics.target_value is a
-- flat number the user types in ("8 hours", "10000 steps") for their own
-- reference on their own private log. It is never derived, never
-- recalculated, never prorated, and never read by
-- monthly-prize-calculation or aggregatePercent.
create table if not exists personal_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  unit text,
  target_value numeric,
  frequency text not null default 'daily'
    check (frequency in ('daily', 'weekly', 'monthly')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_personal_metrics_user
  on personal_metrics (user_id) where is_active;

-- ---------------------------------------------------------------------
-- 4. PERSONAL_METRIC_ENTRIES — dated values for a personal_metric
-- ---------------------------------------------------------------------
-- user_id is denormalized off personal_metrics on purpose: it lets the RLS
-- select policy (and every list query) filter without joining, and the
-- insert policy below independently verifies that the named metric really
-- belongs to that same user, so the two can't drift apart.
--
-- unique (metric_id, entry_date) mirrors checkins' unique (goal_id,
-- checkin_date): one value per metric per day, edited in place rather than
-- appended twice.
create table if not exists personal_metric_entries (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references personal_metrics(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  entry_date date not null,
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  unique (metric_id, entry_date)
);

create index if not exists idx_personal_metric_entries_metric_date
  on personal_metric_entries (metric_id, entry_date desc);

create index if not exists idx_personal_metric_entries_user_date
  on personal_metric_entries (user_id, entry_date desc);

-- ---------------------------------------------------------------------
-- 5. updated_at maintenance for health_logs
-- ---------------------------------------------------------------------
-- health_logs rows are upserted repeatedly through a single day (log weight
-- in the morning, sleep quality at night), so updated_at has to be
-- maintained by the database rather than trusted from the client — an
-- upsert that omits it would otherwise leave a stale value, and one that
-- sets it could set anything.
create or replace function set_health_logs_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_health_logs_updated_at on health_logs;

create trigger trg_health_logs_updated_at
  before update on health_logs
  for each row
  execute function set_health_logs_updated_at();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
-- Shape for all three tables: READ is governed by
-- health_owner_visible_to_me() (owner, or opted-in family member); WRITE is
-- owner-only, always. Read and write are split into separate policies
-- rather than one `for all` policy precisely because they are NOT the same
-- condition here — a `for all using (health_owner_visible_to_me(user_id))`
-- would let a family member edit or delete someone else's health rows the
-- moment that person opted into sharing.
--
-- Every insert/update policy carries an explicit `with check`. INSERT never
-- evaluates `using` at all, and this project has previously shipped exactly
-- that gap (push_subscriptions, fixed in 20260717000005) — so `with check`
-- is written out on every write policy below rather than left to Postgres's
-- using-as-check fallback.

alter table health_logs enable row level security;

drop policy if exists "read visible health logs" on health_logs;
create policy "read visible health logs"
  on health_logs for select
  using (health_owner_visible_to_me(user_id));

drop policy if exists "insert own health logs" on health_logs;
create policy "insert own health logs"
  on health_logs for insert
  with check (user_id = auth.uid());

-- No 24-hour window here, unlike checkins. That rule exists because a
-- checkin is a public claim to the family scoreboard that feeds prize
-- eligibility, so it must stop being rewritable. A private weight entry has
-- no scoreboard and no audience; back-filling last week's numbers is a
-- legitimate, expected use of a health log.
drop policy if exists "update own health logs" on health_logs;
create policy "update own health logs"
  on health_logs for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete own health logs" on health_logs;
create policy "delete own health logs"
  on health_logs for delete
  using (user_id = auth.uid());

alter table personal_metrics enable row level security;

drop policy if exists "read visible personal metrics" on personal_metrics;
create policy "read visible personal metrics"
  on personal_metrics for select
  using (health_owner_visible_to_me(user_id));

drop policy if exists "insert own personal metrics" on personal_metrics;
create policy "insert own personal metrics"
  on personal_metrics for insert
  with check (user_id = auth.uid());

drop policy if exists "update own personal metrics" on personal_metrics;
create policy "update own personal metrics"
  on personal_metrics for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete own personal metrics" on personal_metrics;
create policy "delete own personal metrics"
  on personal_metrics for delete
  using (user_id = auth.uid());

alter table personal_metric_entries enable row level security;

drop policy if exists "read visible personal metric entries" on personal_metric_entries;
create policy "read visible personal metric entries"
  on personal_metric_entries for select
  using (health_owner_visible_to_me(user_id));

-- Both halves are required. `user_id = auth.uid()` alone would let a caller
-- attach their own entry to somebody else's metric_id; the metric_id
-- subquery alone would let them write a row stamped with another user's
-- user_id onto their own metric (poisoning that person's log, since the
-- select policy keys off user_id). Same two-part shape as
-- "insert own goal activity" in 20260717000009.
drop policy if exists "insert own personal metric entries" on personal_metric_entries;
create policy "insert own personal metric entries"
  on personal_metric_entries for insert
  with check (
    user_id = auth.uid()
    and metric_id in (select id from personal_metrics where user_id = auth.uid())
  );

drop policy if exists "update own personal metric entries" on personal_metric_entries;
create policy "update own personal metric entries"
  on personal_metric_entries for update
  using (
    user_id = auth.uid()
    and metric_id in (select id from personal_metrics where user_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    and metric_id in (select id from personal_metrics where user_id = auth.uid())
  );

drop policy if exists "delete own personal metric entries" on personal_metric_entries;
create policy "delete own personal metric entries"
  on personal_metric_entries for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 7. Data API grants
-- ---------------------------------------------------------------------
-- Explicit rather than relying on auto-exposure of new public-schema
-- tables: that behaviour is deprecated and slated to be removed (see the
-- auto_expose_new_tables note in supabase/config.toml), and a table that is
-- RLS-correct but ungranted fails at the PostgREST layer with a confusing
-- permission error. `anon` is deliberately not granted anything — every
-- policy above resolves through auth.uid(), so an anonymous caller would
-- read nothing anyway, and not granting makes that explicit instead of
-- incidental.
grant select, insert, update, delete on table health_logs to authenticated;
grant select, insert, update, delete on table personal_metrics to authenticated;
grant select, insert, update, delete on table personal_metric_entries to authenticated;

grant all on table health_logs to service_role;
grant all on table personal_metrics to service_role;
grant all on table personal_metric_entries to service_role;

grant execute on function health_owner_visible_to_me(uuid) to authenticated;
