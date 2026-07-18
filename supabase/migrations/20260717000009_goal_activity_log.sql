-- GOAL_ACTIVITY_LOG: lightweight, append-only, pre-rendered activity events
-- for goal edits (title/category/unit/frequency/active-state changes),
-- surfaced in the family dashboard's activity feed alongside checkins.
-- Distinct from checkins: no likes, no comments, just "who did what, when".
--
-- change_summary is a client-built human-readable string (e.g. "changed
-- frequency to 5x/week", "renamed to 'Morning Run'"), not structured
-- before/after diff data — there is no undo or diffing UI planned, so a
-- structured schema here would be over-engineering for the actual display
-- need.
--
-- Idempotent: safe to re-run (create table/index if not exists, drop
-- policy if exists).

create table if not exists goal_activity_log (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  change_summary text not null,
  created_at timestamptz not null default now()
);

-- Primary lookup path for the feed: recent activity for a set of goal_ids,
-- ordered by recency. Composite (goal_id, created_at desc) covers both
-- "activity for one goal" and, since Postgres can use a leading-column
-- index for an IN-list of goal_ids too, the family-wide feed's typical
-- "goal_id in (family's goal ids) order by created_at desc" query pattern.
create index if not exists idx_goal_activity_log_goal
  on goal_activity_log (goal_id, created_at desc);

-- Separate recency-only index: the family-wide feed query filters by a
-- (typically large-ish, all-members) IN-list of goal_ids and sorts by
-- created_at, which the composite index above serves reasonably but not
-- optimally as the family's goal count grows (planner has to combine many
-- per-goal index ranges rather than scan one global recency order). This
-- table is expected to be small in absolute terms (no real production
-- scale yet — a handful of families), so a plain created_at desc index is
-- cheap to maintain and gives the feed query a single global-recency scan
-- to fall back on/consider. Warranted given the feed is a "recent N across
-- the whole family" query shape, not a per-goal-only lookup.
create index if not exists idx_goal_activity_log_created_at
  on goal_activity_log (created_at desc);

alter table goal_activity_log enable row level security;

-- READ: any family member can read activity-log entries for goals owned by
-- any member of their family. Same join pattern already established for
-- reactions/comments (checkin_id -> checkins.user_id -> profiles.family_id
-- = current_family_id()), here through goal_id -> goals.user_id ->
-- profiles.family_id = current_family_id() instead. Keys off
-- current_family_id() rather than querying profiles directly, per project
-- convention (avoids recursive RLS lookups on profiles).
drop policy if exists "read family goal activity" on goal_activity_log;

create policy "read family goal activity"
  on goal_activity_log for select
  using (
    goal_id in (
      select id from goals where user_id in (
        select id from profiles where family_id = current_family_id()
      )
    )
  );

-- INSERT: a user may only log activity for a goal they themselves own, and
-- the row's user_id must be the caller. Both conditions live in `with
-- check`, not `using` — INSERT only ever evaluates `with check` (never
-- `using`), so putting either condition only in `using` (or omitting `with
-- check` entirely) would let a client insert a row that names someone
-- else's goal_id and/or someone else's user_id. This project has
-- previously shipped exactly that gap (a `using`-only clause with no
-- matching `with check`) on other client-writable tables and is
-- deliberately not repeating it here.
--
-- No update or delete policy: this is an append-only log. Nobody — not
-- even the row's own author — may edit or remove past entries.
drop policy if exists "insert own goal activity" on goal_activity_log;

create policy "insert own goal activity"
  on goal_activity_log for insert
  with check (
    user_id = auth.uid()
    and goal_id in (select id from goals where user_id = auth.uid())
  );
