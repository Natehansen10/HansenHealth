-- Phase 8 (informal — pre-dates a CLAUDE.md update): four schema-bearing
-- UX/feature changes out of a larger 13-item request. Everything else in
-- that request is UI-only and out of scope for this migration.
--
-- 1. goals.unit             — optional countable-unit label ("Runs", "Miles")
-- 2. checkins detail fields — calories / distance / duration_minutes /
--                              author_message, all optional
-- 3. profiles.onboarded_at  — one-time onboarding-seen flag
-- 4. family_prizes          — new table, admin-set free-text prize
--                              descriptions (display-only, no bearing on
--                              monthly_prizes award logic)
--
-- Idempotent: uses add column if not exists / drop policy if exists / drop
-- trigger if exists throughout so this can be re-run safely.

-- ---------------------------------------------------------------------
-- 1. GOALS: optional unit label
-- ---------------------------------------------------------------------
-- Nullable, no default — client falls back to generic "check-ins" phrasing
-- in the UI when null. Do not bake a default into the column; "no unit set"
-- and "unit is literally the word check-ins" are different states we don't
-- need to distinguish here, but a bogus default would make every existing
-- (and future unit-less) goal silently say "check-ins" in the data layer
-- when that's a UI-only fallback decision.
alter table goals
  add column if not exists unit text;

-- No RLS change needed: "read family goals" / "manage own goals" are
-- row-level policies with no column list (see 20260713000001), so a new
-- nullable column is automatically covered under both existing policies.

-- ---------------------------------------------------------------------
-- 2. CHECKINS: optional per-checkin detail fields
-- ---------------------------------------------------------------------
-- calories/distance/duration_minutes: optional quantifiable detail.
-- distance has no unit column/enum by design (see build-plan constraints —
-- this app has no unit-conversion logic anywhere; miles vs km is on the
-- user). author_message is the checkin author's own note-to-self/friends
-- at logging time — distinct from the pre-existing `note` column (kept
-- as-is, unchanged semantics) and distinct from the `comments` table
-- (other people commenting on the checkin after the fact).
alter table checkins
  add column if not exists calories int,
  add column if not exists distance numeric,
  add column if not exists duration_minutes int,
  add column if not exists author_message text;

-- RLS verification (per instructions, not assumed):
-- "insert own checkins" (`with check (user_id = auth.uid())`),
-- "edit own recent checkins" / "delete own recent checkins"
-- (`using (user_id = auth.uid() and created_at > now() - interval '24 hours')`)
-- are all row-level using/with-check clauses with no column list. Postgres
-- RLS policies apply to whole rows, not a subset of columns, unless a
-- policy is written against a security-barrier view or uses column
-- privileges (GRANT ... (column)) instead of/alongside RLS — neither
-- mechanism is in use anywhere in this schema. Adding nullable columns to
-- `checkins` therefore does not require new policies: the existing
-- policies' row-qualification (own user_id, within the 24h window) governs
-- INSERT/UPDATE/DELETE on the whole row, new columns included, exactly as
-- it already governs `note`. No RLS change made here; none needed.

-- ---------------------------------------------------------------------
-- 3. PROFILES: one-time onboarding flag
-- ---------------------------------------------------------------------
-- Null = user has not yet seen/dismissed onboarding. Set to now() by a
-- Server Action (not built here) via the normal profile-update path.
alter table profiles
  add column if not exists onboarded_at timestamptz;

-- Trigger interaction verification (per instructions, not assumed):
-- prevent_profiles_self_escalation() (20260717000005) only compares
-- new.role IS DISTINCT FROM old.role and new.family_id IS DISTINCT FROM
-- old.family_id, raising an exception solely on those two columns
-- diverging. onboarded_at is not referenced anywhere in that function body,
-- so a client-side `update profiles set onboarded_at = now() where id =
-- auth.uid()` passes the trigger untouched. It also passes the "update own
-- profile" policy (`using (id = auth.uid()) with check (id = auth.uid())`,
-- made explicit in 20260717000004), which is likewise column-agnostic. No
-- trigger or policy change needed for onboarded_at to be self-service
-- writable.

-- ---------------------------------------------------------------------
-- 4. FAMILY_PRIZES: admin-set, family-scoped, display-only prize text
-- ---------------------------------------------------------------------
-- One row per family (unique family_id — current-state only, no history).
-- Purely descriptive text shown on the dashboard: what winning looks like.
-- Does NOT touch monthly_prizes or the monthly-prize-calculation Edge
-- Function — award/unlock logic is untouched and lives elsewhere.
create table if not exists family_prizes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade unique,
  individual_prize_description text,
  group_prize_description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table family_prizes enable row level security;

-- Read: any member of the family (same pattern as every other
-- family-scoped read policy, keyed off current_family_id() rather than a
-- direct profiles lookup, per project convention).
drop policy if exists "read family prizes description" on family_prizes;

create policy "read family prizes description"
  on family_prizes for select
  using (family_id = current_family_id());

-- Write (insert/update): admin-gated AND family-scoped together. Modeled
-- directly on "admin manages invites" (20260713000001), which is the
-- established precedent for admin-gated writes on a family-scoped table.
--
-- Both conditions are required in the same clause on purpose: checking
-- only "is an admin" (without the family_id match) would let an admin of
-- Family A write into Family B's row, since role = 'admin' alone says
-- nothing about which family the row being written belongs to. Checking
-- only "family_id = current_family_id()" (without the role check) would
-- let any member — not just admins — write to their own family's row.
-- Both the `using` and `with check` clauses carry the full
-- family-match-AND-admin-role condition, so this holds for both which
-- existing row can be updated and what a new/updated row is allowed to
-- contain (relevant chiefly for the family_id column itself: a non-admin,
-- or an admin trying to point a row at a different family_id than their
-- own, is rejected either way).
drop policy if exists "admin manages family prizes description" on family_prizes;

create policy "admin manages family prizes description"
  on family_prizes for all
  using (
    family_id = current_family_id()
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    family_id = current_family_id()
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- No client insert/update policy needed beyond the admin one above — this
-- table is NOT in the goal_monthly_targets/monthly_prizes service-role-only
-- category; it is intentionally client-writable, but only by admins of the
-- owning family.
