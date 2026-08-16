-- Phase 7 — hardening pass on 20260815000000, from the rls-security-reviewer
-- gate. No high-severity finding; everything below is defense-in-depth or a
-- house-convention alignment. Four changes:
--
--   1. Composite FK so personal_metric_entries.user_id provably matches its
--      metric's owner, including on service-role writes (which skip RLS).
--   2. Delete policy on personal_metric_entries gets the same two-part shape
--      as its insert/update policies.
--   3. search_path on the new SECURITY DEFINER functions pins pg_temp last,
--      so a temp-schema relation can't shadow `profiles`.
--   4. revoke execute from public on the helper before granting to
--      authenticated, matching 20260717000006's convention rather than
--      relying on Postgres's default PUBLIC execute grant.
--
-- Idempotent throughout.

-- ---------------------------------------------------------------------
-- 1. Tie personal_metric_entries.user_id to personal_metrics.user_id
-- ---------------------------------------------------------------------
-- The denormalized user_id on entries is what the SELECT policy keys off,
-- so a row whose user_id disagrees with its metric's owner would surface
-- under the wrong person's visibility setting. The RLS insert/update
-- policies already prevent that for client writes -- but RLS is exactly
-- what a service-role writer (Edge Function, backfill, SQL console) skips,
-- which is the path where an inconsistent pair could actually appear.
-- A composite FK moves the invariant into the schema, where it holds for
-- every writer regardless of role.
--
-- Requires a unique (id, user_id) on the parent to reference. id is already
-- the primary key, so this adds no real constraint on personal_metrics --
-- it exists purely to give the composite FK a target.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'personal_metrics_id_user_id_key'
  ) then
    alter table personal_metrics
      add constraint personal_metrics_id_user_id_key unique (id, user_id);
  end if;
end $$;

-- Replace the single-column FK rather than adding alongside it: two FKs
-- from the same column set to the same table would make PostgREST's
-- embedding ambiguous and give the generated types two near-identical
-- relationship entries. The composite subsumes the original completely,
-- and carries the same on delete cascade so deleting a metric still
-- removes its entries.
alter table personal_metric_entries
  drop constraint if exists personal_metric_entries_metric_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'personal_metric_entries_metric_owner_fkey'
  ) then
    alter table personal_metric_entries
      add constraint personal_metric_entries_metric_owner_fkey
      foreign key (metric_id, user_id)
      references personal_metrics (id, user_id)
      on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Delete policy: match the insert/update two-part shape
-- ---------------------------------------------------------------------
-- Insert and update both verify the metric belongs to the caller; delete
-- checked only user_id. With the composite FK above a mismatched row can no
-- longer exist, so this is belt-and-braces -- but leaving one of three
-- policies with a different predicate is the kind of asymmetry that reads
-- as an oversight later and invites someone to "simplify" the other two
-- down to match.
drop policy if exists "delete own personal metric entries" on personal_metric_entries;

create policy "delete own personal metric entries"
  on personal_metric_entries for delete
  using (
    user_id = auth.uid()
    and metric_id in (select id from personal_metrics where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 3. Pin pg_temp explicitly in SECURITY DEFINER search_paths
-- ---------------------------------------------------------------------
-- `set search_path = public` alone is not the full guard the original
-- comment claimed. Function and operator names are never resolved from
-- pg_temp, so current_family_id() was never shadowable -- but RELATION
-- names are searched in pg_temp FIRST when pg_temp isn't explicitly listed,
-- which leaves `from profiles` inside the body shadowable by a
-- pg_temp.profiles. Listing pg_temp last forces public to win.
--
-- Not reachable through PostgREST today (no DDL surface there), so this is
-- hardening rather than a live hole.
create or replace function health_owner_visible_to_me(owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
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

-- The fail-closed behaviour when current_family_id() is null is worth
-- stating outright, because it is currently implicit in SQL null semantics:
-- for a user with no family, `p.family_id = current_family_id()` is NULL
-- (not true), so exists(...) is false and only the owner branch can match.
-- That is correct — but it means a future "cleanup" replacing the equality
-- with `is not distinct from`, or wrapping current_family_id() in a
-- coalesce, would silently turn this into a cross-tenant read of every
-- family-less user's health log. Do not do that.

create or replace function set_health_logs_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Revoke the default PUBLIC execute grant on the helper
-- ---------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every newly created function, so
-- 20260815000000's `grant execute ... to authenticated` was redundant and
-- anon kept execute via PUBLIC — contradicting that migration's own
-- "anon is deliberately not granted anything" note.
--
-- Impact was nil (for anon both auth.uid() and current_family_id() are
-- null, so the function returns NULL for every input, constant across all
-- UUIDs and therefore not an existence oracle). Aligning anyway with the
-- explicit revoke-then-grant convention established in
-- 20260717000006_notify_activity_webhook.sql.
revoke all on function health_owner_visible_to_me(uuid) from public;
revoke all on function health_owner_visible_to_me(uuid) from anon;
grant execute on function health_owner_visible_to_me(uuid) to authenticated;
grant execute on function health_owner_visible_to_me(uuid) to service_role;
