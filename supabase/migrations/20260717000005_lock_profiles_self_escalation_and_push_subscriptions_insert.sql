-- Phase 5 security fixes (found by rls-security-reviewer, both pre-existing
-- gaps, urgent now that Phase 5 client code paths are about to ship):
--
-- 1. profiles self-escalation: the "update own profile" policy only
--    restricts *which row* can be updated (id = auth.uid()), not which
--    columns. A user can currently run
--      update profiles set role = 'admin', family_id = '<other-uuid>'
--      where id = auth.uid()
--    and pass RLS, self-promoting to admin (trusted by the
--    "admin manages invites" policy) and/or hopping into another family
--    (trusted by current_family_id(), which nearly every other table's RLS
--    keys off). Fixed with a BEFORE UPDATE trigger that blocks changes to
--    role/family_id when the update is made through the normal
--    RLS-governed client path (authenticated/anon Postgres roles), while
--    leaving service-role writes (Edge Functions, future admin tooling)
--    untouched.
--
--    Both current legitimate writers of profiles.family_id/.role
--    (create_family, accept_family_invite in
--    20260713000002_family_join_functions.sql) write these columns via
--    INSERT, not UPDATE, so this trigger does not affect them at all —
--    see migration comment below for the verification detail.
--
-- 2. push_subscriptions insert gap: "manage own push subscriptions" is
--    `for all using (user_id = auth.uid())` with no `with check`.
--    Postgres's implicit using-as-check fallback only applies to UPDATE,
--    not INSERT, so INSERT is currently unchecked — a user could insert a
--    subscription row with someone else's user_id. Fixed by adding an
--    explicit with check clause.

-- ---------------------------------------------------------------------
-- Fix 1: profiles self-escalation guard
-- ---------------------------------------------------------------------

-- Verification note on the invite-acceptance flow (per instructions):
-- create_family() and accept_family_invite() (20260713000002) are the only
-- two places that ever set profiles.family_id or profiles.role for a
-- client-driven flow. Both are `security definer` functions, but critically
-- both write family_id/role via a plain `insert into profiles (...)` — there
-- is no `update profiles set family_id = ...` anywhere in either function,
-- and no application code path (checked components/ and app/) issues a
-- profiles update touching family_id or role either. So a BEFORE UPDATE
-- trigger on profiles has nothing to do here: neither function performs an
-- UPDATE on this table at all, only INSERT. The trigger below therefore
-- cannot break onboarding/invite-acceptance regardless of how it's scoped.
--
-- The role guard below (auth.role() <> 'service_role') is included anyway
-- as defense-in-depth for future flows (e.g. an eventual admin-transfer
-- feature, or a service-role/Edge-Function path that legitimately needs to
-- reassign family_id or role directly via UPDATE) so this trigger doesn't
-- have to be revisited when that ships.

create or replace function prevent_profiles_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only guard updates made through the normal RLS-governed client path.
  -- Service-role callers (Edge Functions, future trusted admin/server
  -- flows) bypass RLS anyway and are intentionally exempted here so they
  -- are never blocked from legitimate role/family_id maintenance.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Changing profiles.role directly is not allowed';
  end if;

  if new.family_id is distinct from old.family_id then
    raise exception 'Changing profiles.family_id directly is not allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_profiles_self_escalation on profiles;

create trigger trg_prevent_profiles_self_escalation
  before update on profiles
  for each row
  execute function prevent_profiles_self_escalation();

-- ---------------------------------------------------------------------
-- Fix 2: push_subscriptions insert gap
-- ---------------------------------------------------------------------

drop policy if exists "manage own push subscriptions" on push_subscriptions;

create policy "manage own push subscriptions"
  on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
