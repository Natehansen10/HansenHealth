-- These are the ONLY two ways a profiles row is ever created by a client.
-- There is intentionally no insert policy on profiles: both paths validate
-- and write atomically as security definer, so RLS never needs to arbitrate
-- a client-writable insert into profiles.

-- Creates a new family and makes the calling user its admin.
create or replace function create_family(
  family_name text,
  new_full_name text,
  new_timezone text default 'America/Denver'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_family_id uuid;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'User already has a profile';
  end if;

  insert into families (name, created_by)
  values (family_name, auth.uid())
  returning id into new_family_id;

  insert into profiles (id, full_name, family_id, timezone, role)
  values (auth.uid(), new_full_name, new_family_id, new_timezone, 'admin');

  return new_family_id;
end;
$$;

-- Validates an invite token against the caller's authenticated email,
-- joins the caller to the invite's family as a member, and marks the
-- invite accepted. Raises if the token is invalid, expired, already
-- accepted, or doesn't match the caller's email.
create or replace function accept_family_invite(
  invite_token text,
  new_full_name text,
  new_timezone text default 'America/Denver'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite family_invites%rowtype;
  caller_email text;
  joined_family_id uuid;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'User already has a profile';
  end if;

  select * into invite
  from family_invites
  where token = invite_token
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if invite.status <> 'pending' then
    raise exception 'Invite is no longer pending';
  end if;

  if invite.expires_at < now() then
    update family_invites set status = 'expired' where id = invite.id;
    raise exception 'Invite has expired';
  end if;

  select email into caller_email from auth.users where id = auth.uid();

  if caller_email is null or lower(caller_email) <> lower(invite.email) then
    raise exception 'Invite email does not match authenticated user';
  end if;

  insert into profiles (id, full_name, family_id, timezone, role)
  values (auth.uid(), new_full_name, invite.family_id, new_timezone, 'member');

  update family_invites set status = 'accepted' where id = invite.id;

  joined_family_id := invite.family_id;
  return joined_family_id;
end;
$$;
