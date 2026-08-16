# Family Health Tracker — Build Plan

## Decisions Locked In

| Topic | Decision |
|---|---|
| Family membership | One family per user |
| Progress display | Summary bar + expandable per-goal detail |
| Monthly prize | Everyone who hits 100% wins; no prize if nobody hits it |
| Mid-month frequency changes | Take effect next month only; no pro-rating |
| Reactions | Simple like/heart only |
| Notification triggers | Check-ins, reactions, comments (full activity) |
| Notification channel | Email and web push, both |
| Timezone | Per-user, set individually |
| Check-in edits | Editable/deletable within 24 hours of logging |
| Signup | Invite-only (family admin sends invite link) |
| Design | Clean/minimal, neutral grays, one accent color, light mode only |

One assumption worth confirming before Phase 1: a goal created mid-month gets a full, non-prorated target for that month (same treatment as if it existed since month start), rather than waiting until next month. This keeps the target logic in one function instead of two. Flag it if you want new goals to also wait until next month.

---

## Schema Design Notes

Two structural changes from the draft:

1. **`goal_monthly_targets` replaces the static `goals.month_target` column.** Since frequency changes only apply next month, the target has to be a per-month snapshot, not a single field on the goal. This is computed by an Edge Function, not the client.
2. **`monthly_prizes` drops the single `winner_user_id` column** in favor of one row per winner, since multiple winners are allowed.

---

## Finalized Postgres Schema

```sql
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
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
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
```

### Indexes

```sql
create index idx_goals_user on goals(user_id) where is_active = true;
create index idx_checkins_goal_date on checkins(goal_id, checkin_date);
create index idx_checkins_user on checkins(user_id);
create index idx_reactions_checkin on reactions(checkin_id);
create index idx_comments_checkin on comments(checkin_id);
create index idx_goal_targets_month on goal_monthly_targets(goal_id, month);
```

---

## RLS Policies

All policies key off a security-definer helper to avoid recursive RLS lookups on `profiles`:

```sql
create or replace function current_family_id()
returns uuid
language sql
security definer
stable
as $$
  select family_id from profiles where id = auth.uid();
$$;
```

```sql
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
```

Note: `goal_monthly_targets` and `monthly_prizes` have no insert/update policy for regular users because both are written exclusively by Edge Functions using the service role key, which bypasses RLS.

---

## Screen / Route Map (Next.js App Router)

```
/login                        Auth: Google + email magic link
/invite/[token]                Accept invite, create profile, join family
/onboarding/create-family      Admin path: create family, becomes admin
/                              Family dashboard: everyone's summary bars, activity feed
/goals                         My goals: list, edit frequency, deactivate
/goals/new                     Pick template or custom goal + frequency question
/checkin                       Log a check-in (modal or dedicated route)
/family/[userId]               One person's expanded view: per-goal bars, history
/prizes                        Monthly winners, current month standings
/settings                      Timezone, notification preferences
/settings/family                Admin only: manage invites, view pending
```

State/data approach: Supabase Realtime subscriptions on `checkins`, `reactions`, and `comments` scoped to family, so the dashboard updates live without polling.

---

## Phased Build Roadmap

**Phase 1 — Foundation**
Supabase project setup, full schema + RLS above, Next.js scaffold on Vercel, Google + email auth, family creation and invite-only join flow.
Milestone: a user can sign up via invite link, land in a family, and see an empty dashboard.

**Phase 2 — Goals**
Goal templates seed data, goal creation flow (template or custom + frequency question), goal management screen (edit, deactivate).
Milestone: a user can create and manage their own goals.

**Phase 3 — Check-ins and monthly targets**
Check-in logging UI, 24-hour edit/delete window, `monthly-target-snapshot` Edge Function (handles both month rollover and new-goal creation).
Milestone: a user logs a check-in and sees an accurate percentage against a real target.

**Phase 4 — Family feed**
Dashboard with summary + expandable per-goal bars, Realtime subscriptions, likes, comments.
Milestone: the whole family sees and reacts to each other's check-ins live.

**Phase 5 — Notifications**
Web push subscription flow (VAPID keys, service worker), email provider integration (Resend recommended for Supabase Edge Function compatibility), database webhook triggers on insert to `checkins`/`reactions`/`comments`.
Milestone: logging a check-in notifies the family by push and email.

**Phase 6 — Monthly prizes**
`monthly-prize-calculation` Edge Function on cron, prize history screen, current-month standings.
Milestone: month rolls over, winners get recorded and see it on `/prizes`.

**Phase 7 — Polish and launch**
Mobile-first responsive pass, empty states, error handling, loading states, production deploy checklist.
Milestone: live on Vercel, usable end to end by the family.

---

## Edge Function Specs

### 1. `monthly-target-snapshot`
**Trigger:** Cron, 1st of month at 00:05 in each user's local context (run once daily and check per-timezone, or run once UTC and accept a small boundary tolerance — recommend the latter for v1). Also called synchronously on goal creation.
**Logic:**
- For each active goal without a `goal_monthly_targets` row for the current month, compute `weeks_in_month` (count of that weekday-cycle, or simpler: `frequency_per_week * (days_in_month / 7)` rounded) and insert a row using the goal's current `frequency_per_week`.
**Auth:** Service role key (bypasses RLS).

### 2. `monthly-prize-calculation`
**Trigger:** Cron, 1st of month at 00:15 UTC, evaluating the prior month.
**Logic:**
- For each family, for each user, sum check-ins vs. targets across all active goals for the prior month.
- Compute aggregate percentage per user (average across goals, matching the dashboard's summary-bar logic).
- Insert a `monthly_prizes` row for every user at 100% or above.
**Auth:** Service role key.

### 3. `notify-activity`
**Trigger:** Database Webhook on insert to `checkins`, `reactions`, `comments`.
**Logic:**
- Resolve the family members to notify (exclude the actor).
- Fan out to `push_subscriptions` (web push via VAPID) and email (Resend) per recipient's notification preferences.
**Auth:** Service role key, invoked by Supabase's built-in webhook mechanism.

---

## Claude Code Setup

### CLAUDE.md

This is the file Claude Code reads at the start of every session in this repo. It should carry the constraints that are easy to accidentally violate mid-build, not a restatement of the whole plan above.

```markdown
# Family Health Tracker

Web app for a family to track exercise goals together: set goals, check in,
see everyone's progress, react, comment, win a monthly prize.

## Stack
- Next.js (App Router), deployed on Vercel
- Supabase: Postgres, Auth (Google + email magic link), Realtime, Edge Functions (Deno)
- Styling: Tailwind, neutral grays + one accent color, light mode only, mobile-first

## Hard constraints — do not silently change these
- One family per user. No multi-family membership, no join table for it.
- Reactions are like-only. No reaction type enum, no emoji picker.
- Frequency changes and new goals get a non-prorated full-month target,
  computed by the monthly-target-snapshot Edge Function. Never compute
  month_target on the client or store it as a static column on `goals`.
- Monthly prizes: every user at or above 100% wins. No single-winner logic,
  no tiebreaker logic.
- Check-ins are editable/deletable only within 24 hours of `created_at`.
  Enforce this in RLS, not just the UI.
- Signup is invite-only. No open family-code join flow.
- Timezone is per-user (`profiles.timezone`), not per-family or device-local.

## Security
- RLS is the source of truth for family-scoped access. Every new table needs
  a policy before it ships, not after.
- Service role key is used only inside Supabase Edge Functions
  (`goal_monthly_targets`, `monthly_prizes` writes). Never expose it to a
  Next.js API route or client bundle.
- Run new tables and policies past the rls-security-reviewer subagent before
  considering a schema change done.

## Commands
- `npm run dev` — local dev server
- `npm run build` / `npm run lint` / `npm run typecheck`
- `supabase db push` — apply migrations
- `supabase functions serve <name>` — test an Edge Function locally
- `supabase functions deploy <name>` — deploy an Edge Function
- `supabase gen types typescript --local > lib/types/database.types.ts`

## Workflow
Build one phase of the roadmap at a time (see build plan doc). At the end
of each phase, run the phase-gate-agent checklist before starting the next
phase. Do not start Phase N+1 work inside the same session as unresolved
Phase N issues.

## Conventions
- Server Components by default; Client Components only where interaction
  requires it (check-in form, reaction buttons, realtime feed).
- Supabase client: `lib/supabase/server.ts` in Server Components/Actions,
  `lib/supabase/client.ts` in Client Components. Never mix them.
- All dates handled in the user's `profiles.timezone`, not server time or
  browser time, for check-in day boundaries.
```

### Custom Subagents

Five subagents, each scoped narrowly enough that Claude Code doesn't need to hold the whole app in mind for routine changes. Store as `.claude/agents/<name>.md` with frontmatter.

**`db-schema-agent`**
Owns Supabase migrations and RLS policies. Invoked for any table, column, or policy change. Writes idempotent, timestamped migration files under `supabase/migrations/`. Always pairs a new table with its RLS policy in the same migration; never ships one without the other. Knows `goal_monthly_targets` and `monthly_prizes` take no client insert/update policy since Edge Functions write them with the service role key.

**`edge-function-agent`**
Owns the three Deno Edge Functions: `monthly-target-snapshot`, `monthly-prize-calculation`, `notify-activity`. Tests locally with `supabase functions serve` before any deploy. Responsible for the non-prorating target math and the aggregate percentage calculation, since both live only here, not in the client.

**`ui-agent`**
Builds screens and components against the route map below. Enforces the locked design decision: neutral grays, one accent color, light mode only, mobile-first breakpoints. Pulls shared primitives (progress bar, card, button) from `components/ui/` rather than reimplementing per screen.

**`rls-security-reviewer`**
Read-only subagent, no write access. Reviews any new or changed table/policy against the family-scoping pattern (`current_family_id()`) before it's marked done. Specifically checks for the two easy mistakes in this schema: a table that's readable across families, and a client-writable path into `goal_monthly_targets` or `monthly_prizes`.

**`phase-gate-agent`**
Runs at the end of each roadmap phase. Checklist: build passes, lint/typecheck clean, RLS reviewed for anything touched this phase, and the phase's stated milestone actually works end to end. Blocks moving to the next phase until the checklist passes, matching the step-by-step confirmation you asked for at kickoff.

### Project Structure

```
family-health-tracker/
├── CLAUDE.md
├── .claude/
│   ├── agents/
│   │   ├── db-schema-agent.md
│   │   ├── edge-function-agent.md
│   │   ├── ui-agent.md
│   │   ├── rls-security-reviewer.md
│   │   └── phase-gate-agent.md
│   └── settings.json
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── invite/[token]/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              # authenticated shell, family nav
│   │   ├── page.tsx                # dashboard
│   │   ├── goals/
│   │   │   ├── page.tsx
│   │   │   └── new/page.tsx
│   │   ├── checkin/page.tsx
│   │   ├── family/[userId]/page.tsx
│   │   ├── prizes/page.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── family/page.tsx
│   └── onboarding/create-family/page.tsx
├── components/
│   ├── ui/                         # progress bar, card, button, avatar
│   ├── goals/
│   ├── checkins/
│   └── family/
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # browser client
│   │   ├── server.ts                # server component client
│   │   └── middleware.ts
│   ├── types/
│   │   └── database.types.ts        # generated, not hand-written
│   └── utils/
├── supabase/
│   ├── migrations/                  # one file per schema change, timestamped
│   ├── functions/
│   │   ├── monthly-target-snapshot/
│   │   ├── monthly-prize-calculation/
│   │   └── notify-activity/
│   ├── seed.sql                     # goal_templates data
│   └── config.toml
├── public/
├── middleware.ts                    # auth session refresh
├── next.config.js
├── package.json
└── tsconfig.json
```

Route groups `(auth)` and `(app)` separate unauthenticated screens from the authenticated shell without affecting the URL path. The `supabase/` folder mirrors the Supabase CLI's own conventions so migrations and functions stay deployable with `supabase db push` and `supabase functions deploy` directly, no custom tooling needed.

## Next Step

Phase 1: Supabase schema + Next.js scaffold + auth. Confirm the schema above looks right, then say go and we build it.

---

# Phase 7 — Polish and launch (built 2026-08-15)

Phase 7 folded in a scope expansion agreed at the start of the phase: the app
grew a **personal health log** alongside the family exercise-goal game, and
the responsive/empty/loading/error pass was done across the new and existing
routes together rather than as two passes.

## 7a. Personal health log schema

Migrations `20260815000000_personal_health_logs.sql` and
`20260815000001_health_log_rls_hardening.sql`.

Kept deliberately separate from `goals`/`checkins`. Those are the family game:
family-visible, month targets owned by Edge Functions, prize logic on top.
The health log is personal data with a different privacy default, a different
edit model, and no connection to prize eligibility. Nothing below feeds
`goal_monthly_targets`, `monthly_prizes`, or `aggregatePercent`.

```sql
-- One row per user per day. Column-per-metric rather than a tall
-- (user, date, metric, value) table: the log form writes these together and
-- every read is "last N days of one or more metrics for one user".
create table health_logs (
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
  updated_at timestamptz not null default now(),  -- maintained by trigger
  unique (user_id, log_date)
);

-- User-defined trackable metric. target_value is a flat number the user
-- types for their own reference -- NOT the derived monthly target concept
-- from goal_monthly_targets, and not read by any Edge Function.
create table personal_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  unit text,
  target_value numeric,
  frequency text not null default 'daily' check (frequency in ('daily','weekly','monthly')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table personal_metric_entries (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null,
  user_id uuid not null references profiles(id) on delete cascade,
  entry_date date not null,
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  unique (metric_id, entry_date),
  -- Composite FK, not a plain metric_id reference: it makes
  -- "entries.user_id always equals its metric's owner" hold for
  -- service-role writes too, not just RLS-governed ones.
  constraint personal_metric_entries_metric_owner_fkey
    foreign key (metric_id, user_id)
    references personal_metrics (id, user_id) on delete cascade
);

alter table profiles
  add column health_visibility text not null default 'private'
    check (health_visibility in ('private','family')),
  add column weight_unit text not null default 'lb'
    check (weight_unit in ('lb','kg'));
```

`weight_unit` is a **display label only**. This app has no unit-conversion
logic anywhere (same standing decision as `checkins.distance`) — switching it
relabels charts and converts nothing.

## 7b. Health log RLS

Read and write are different conditions here, so they are separate policies
per table rather than one `for all`. Read is governed by a helper; **write is
owner-only always**, including when the owner has opted into sharing.

```sql
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
      select 1 from profiles p
      where p.id = owner_id
        and p.family_id = current_family_id()
        and p.health_visibility = 'family'
    );
$$;
```

Per table (`health_logs`, `personal_metrics`, `personal_metric_entries`):

- `select using (health_owner_visible_to_me(user_id))`
- `insert with check (user_id = auth.uid())`
- `update using (user_id = auth.uid()) with check (user_id = auth.uid())`
- `delete using (user_id = auth.uid())`

`personal_metric_entries` additionally carries
`and metric_id in (select id from personal_metrics where user_id = auth.uid())`
on insert, update **and** delete, so an entry can neither be attached to
someone else's metric nor stamped with someone else's `user_id`.

Two properties worth not breaking:

- **The null-family case is fail-closed by SQL null semantics, not by an
  explicit guard.** For a user with no family, `p.family_id =
  current_family_id()` is NULL rather than true. Replacing that equality with
  `is not distinct from`, or wrapping `current_family_id()` in a `coalesce`,
  would turn this into a cross-tenant read of every family-less user's health
  log.
- **No 24-hour edit window here, unlike `checkins`.** That rule exists because
  a check-in is a public claim to the family scoreboard feeding prize
  eligibility. A private weight entry has no scoreboard; back-filling last
  week's numbers is expected use.

Verified against hosted with real authenticated sessions (three throwaway
users across two throwaway families, all cleaned up): owner read/write works;
a same-family member sees nothing while the owner is private, sees the log
once the owner opts in, and still cannot update or delete it; a **different
family** sees nothing either way. This is the first time cross-tenant
isolation has actually been exercised on this project — CLAUDE.md previously
recorded it as untestable for lack of a second family.

One behavioural consequence of the `revoke ... from public` on the helper:
an **anonymous** PostgREST request to any of the three tables now fails with
`42501 permission denied for function health_owner_visible_to_me` instead of
returning an empty array. That is fail-closed and fine — every app path
redirects to `/login` before querying — but it is a different error shape than
the other tables give, which return `[]` to anon.

## 7c. New routes

```
/log       unified entry point: goal check-ins, body, vitals, sleep,
           activity, custom metrics — tabbed, one save per section
/health    trends (weight, body fat, BP, resting HR, sleep, sleep quality,
           steps), personal-metric management, recent entries
```

`/log` replaced the dashboard's quick check-in modal
(`components/checkins/quick-checkin-modal.tsx`, deleted). Its "Check in"
section reuses the same `GoalCheckinRow` against the same
`getQuickCheckinData`, so nothing was lost — the dashboard CTA now points at
`/log` instead of opening a modal that could only do check-ins.

Navigation changed shape for mobile: the hamburger menu is gone, replaced by a
fixed five-item bottom tab bar (`components/layout/bottom-nav.tsx`) on phones,
with the same links rendered inline in the top bar from `sm:` up. Settings and
sign-out stay in the top bar — five targets is the most that stays comfortably
tappable at 320px, and settings is the rarest destination.

## 7d. Charts without a charting library

`components/ui/line-chart.tsx` is hand-rolled SVG (`LineChart` + `Sparkline`),
both Server Components shipping zero JS. Recharts (~90kb) or Chart.js (~70kb)
would have been most of the app's JS budget for what is a polyline through a
few hundred dated points.

The load-bearing detail: the `<svg>` uses `preserveAspectRatio="none"` so the
plot stretches to its container at a fixed pixel height. That non-uniform
scale distorts anything with intrinsic proportions, so every stroked path
carries `vector-effect="non-scaling-stroke"`, and there is **no `<text>`, no
`<circle>` and no marker inside the SVG** — all labels are HTML rendered
around it. Adding a `<text>` there will look right at one width and visibly
wrong at another.

## 7e. Production deploy checklist

Environment (Vercel project settings — the same four the app needs locally in
`.env.local`):

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (server-only — confirm it is **not** in the
      browser bundle; it belongs to Server Actions only)

Supabase (hosted, `krcuyqsmahavlahkpoyc`):

- [ ] `supabase db push` — all migrations applied through
      `20260815000001_health_log_rls_hardening`
- [ ] `supabase gen types typescript --project-id …` regenerated and committed
- [ ] Edge Function secrets set: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`,
      `SITE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- [ ] `service_role_key` present in Vault (the pg_cron jobs read it from there)
- [ ] pg_cron jobs scheduled: `monthly-target-snapshot`,
      `monthly-prize-calculation`
- [ ] `notify-activity` still returns 401 for no key / garbage key / anon key
      (it deploys with `verify_jwt = false`; its own `apikey` check is the
      only thing in front of the public internet)
- [ ] Auth redirect URLs include the production origin, or magic links land on
      localhost

Build and runtime:

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run build` succeeds
- [ ] Manual pass on a real phone: bottom tab bar reachable one-handed, no
      horizontal scroll, safe-area inset respected in standalone (home-screen)
      mode

Known follow-ups, not blockers:

- **`middleware.ts` → `proxy.ts`.** Next 16.2 warns the `middleware` file
  convention is deprecated. Deliberately not renamed in Phase 7: that file
  carries auth session refresh, and bundling an auth-path rename into a UI
  phase is how a working login breaks quietly. Do it as its own change with a
  magic-link round trip to verify.
- **`prevent_profiles_self_escalation()` is a deny-list.** It names only
  `role` and `family_id`, so every new `profiles` column is self-writable by
  default (`onboarded_at`, `push_enabled`/`email_enabled`, and now
  `health_visibility`/`weight_unit` have all landed this way). Correct for all
  five, but inverting it to an allow-list is the durable fix before a column
  lands where self-write is wrong.
- **`current_family_id()` has no `set search_path`** (it predates the
  convention). Every policy that calls it directly runs it under the session
  search_path.
- **Hosted carries legacy default privileges granting new public-schema tables
  to `anon`.** Confirmed by probe: `family_prizes` and `goal_activity_log`
  ship no grants of their own yet are reachable by an anon PostgREST request
  (RLS then returns `[]`). Harmless today since every policy resolves through
  `auth.uid()`, but it means the explicit grants in
  `20260815000000` are belt-and-braces rather than the thing making those
  tables work.
