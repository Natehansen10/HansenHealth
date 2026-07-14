create extension if not exists pgcrypto with schema extensions;

-- FAMILIES
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- PROFILES
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  family_id uuid references families(id),
  timezone text not null default 'America/Denver',
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

-- FAMILY INVITES (invite-only signup)
create table family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  email text not null,
  invited_by uuid not null references profiles(id),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

-- GOAL TEMPLATES
create table goal_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  default_frequency_per_week int not null,
  icon text
);

-- GOALS
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  category text,
  frequency_per_week int not null check (frequency_per_week between 1 and 7),
  source text not null default 'custom' check (source in ('template', 'custom')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- GOAL MONTHLY TARGETS (snapshot, not recomputed retroactively)
create table goal_monthly_targets (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  month date not null, -- first day of month, e.g. 2026-07-01
  frequency_per_week int not null,
  target int not null,
  created_at timestamptz not null default now(),
  unique (goal_id, month)
);

-- CHECKINS
create table checkins (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  checkin_date date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (goal_id, checkin_date)
);

-- REACTIONS (like only)
create table reactions (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references checkins(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (checkin_id, user_id)
);

-- COMMENTS
create table comments (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references checkins(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- MONTHLY PRIZES (one row per winner)
create table monthly_prizes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  month date not null,
  user_id uuid not null references profiles(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (family_id, month, user_id)
);

-- WEB PUSH SUBSCRIPTIONS
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- INDEXES
create index idx_goals_user on goals(user_id) where is_active = true;
create index idx_checkins_goal_date on checkins(goal_id, checkin_date);
create index idx_checkins_user on checkins(user_id);
create index idx_reactions_checkin on reactions(checkin_id);
create index idx_comments_checkin on comments(checkin_id);
create index idx_goal_targets_month on goal_monthly_targets(goal_id, month);
