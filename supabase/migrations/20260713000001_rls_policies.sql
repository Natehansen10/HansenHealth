-- Security-definer helper to avoid recursive RLS lookups on profiles
create or replace function current_family_id()
returns uuid
language sql
security definer
stable
as $$
  select family_id from profiles where id = auth.uid();
$$;

-- PROFILES: read anyone in your family, update only yourself
alter table profiles enable row level security;

create policy "read family members"
  on profiles for select
  using (family_id = current_family_id());

create policy "update own profile"
  on profiles for update
  using (id = auth.uid());

-- FAMILIES: read your own family
alter table families enable row level security;

create policy "read own family"
  on families for select
  using (id = current_family_id());

-- FAMILY_INVITES: admins of the family can manage; invited email can read their own
alter table family_invites enable row level security;

create policy "admin manages invites"
  on family_invites for all
  using (
    family_id = current_family_id()
    and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- GOALS: read family goals, write your own
alter table goals enable row level security;

create policy "read family goals"
  on goals for select
  using (user_id in (select id from profiles where family_id = current_family_id()));

create policy "manage own goals"
  on goals for all
  using (user_id = auth.uid());

-- GOAL_MONTHLY_TARGETS: read family targets, writes go through Edge Function (service role)
alter table goal_monthly_targets enable row level security;

create policy "read family targets"
  on goal_monthly_targets for select
  using (
    goal_id in (
      select id from goals where user_id in (
        select id from profiles where family_id = current_family_id()
      )
    )
  );

-- CHECKINS: read family checkins, write/edit/delete your own within 24 hours
alter table checkins enable row level security;

create policy "read family checkins"
  on checkins for select
  using (user_id in (select id from profiles where family_id = current_family_id()));

create policy "insert own checkins"
  on checkins for insert
  with check (user_id = auth.uid());

create policy "edit own recent checkins"
  on checkins for update
  using (user_id = auth.uid() and created_at > now() - interval '24 hours');

create policy "delete own recent checkins"
  on checkins for delete
  using (user_id = auth.uid() and created_at > now() - interval '24 hours');

-- REACTIONS: read/write within family
alter table reactions enable row level security;

create policy "read family reactions"
  on reactions for select
  using (
    checkin_id in (
      select id from checkins where user_id in (
        select id from profiles where family_id = current_family_id()
      )
    )
  );

create policy "manage own reactions"
  on reactions for all
  using (user_id = auth.uid());

-- COMMENTS: read/write within family, no edit window restriction (comments stay editable)
alter table comments enable row level security;

create policy "read family comments"
  on comments for select
  using (
    checkin_id in (
      select id from checkins where user_id in (
        select id from profiles where family_id = current_family_id()
      )
    )
  );

create policy "manage own comments"
  on comments for all
  using (user_id = auth.uid());

-- MONTHLY_PRIZES: read only, written by service role
alter table monthly_prizes enable row level security;

create policy "read family prizes"
  on monthly_prizes for select
  using (family_id = current_family_id());

-- PUSH_SUBSCRIPTIONS: manage your own
alter table push_subscriptions enable row level security;

create policy "manage own push subscriptions"
  on push_subscriptions for all
  using (user_id = auth.uid());
