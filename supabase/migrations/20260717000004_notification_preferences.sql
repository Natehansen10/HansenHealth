-- Phase 5 (Notifications): per-user opt-out toggles for push and email.
-- Default true so notifications work immediately without a settings visit.
-- Note: push_subscriptions table + its RLS policy already exist from the
-- initial schema/RLS migrations (20260713000000 / 20260713000001) — no
-- change needed there.

alter table profiles
  add column if not exists push_enabled boolean not null default true,
  add column if not exists email_enabled boolean not null default true;

-- The existing "update own profile" policy only defined a `using` clause.
-- For UPDATE policies, Postgres reuses `using` as the check clause when no
-- `with check` is given, so this was not a functional gap — but now that
-- profiles carries more self-editable columns (push_enabled, email_enabled,
-- alongside family_id/role/etc.), make the check explicit rather than
-- relying on the implicit fallback.
drop policy if exists "update own profile" on profiles;

create policy "update own profile"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
