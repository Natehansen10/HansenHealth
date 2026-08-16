# Family Health Tracker

Two things live in this app, and keeping them straight matters:

1. **The family exercise-goal game** — set goals, check in, see everyone's
   progress, react, comment, win a monthly prize. Family-visible by design.
2. **A personal health log** — weight, body fat, blood pressure, resting heart
   rate, sleep, steps, and user-defined metrics. **Private by default**, with
   an opt-in to share with the family.

Phases 1-7 of `family-health-tracker-build-plan.md` are built. Phase 7's
**production deploy checklist has not been executed** — it is written up in
the build plan and still needs a run-through before launch. Per-phase history
lives in the build plan, not here.

## Read this first: the framework is newer than your training data
Next.js **16.2.10**, React **19.2.4**, Tailwind **v4**, `babel-plugin-react-compiler`.
`AGENTS.md` applies to this repo and says it plainly: APIs, conventions, and
file structure differ from what you remember. Read the relevant guide in
`node_modules/next/dist/docs/` before writing Next.js code — don't pattern-match
from Next 13/14 memory. Same for Tailwind v4 (CSS-first config in
`app/globals.css`, no `tailwind.config.js`).

## Environment
- **No local Docker.** `supabase db reset`, `supabase functions serve`, and
  `--local` type generation are all unavailable. Everything is developed and
  tested directly against the **hosted** project (`krcuyqsmahavlahkpoyc`).
  `supabase/seed.sql` is kept in sync but never actually runs — seed data ships
  as a timestamped migration instead (`20260713000003_seed_goal_templates.sql`).
- Edge Functions are tested by deploying to hosted and invoking with curl and
  the service role key.
- `supabase/functions/**` is excluded from the Next.js `tsconfig.json` and
  `eslint.config.mjs` — it's Deno, not Node, with its own module resolution.
  Don't try to fold it into the Next.js TS project.
- **No test runner.** No vitest/jest/playwright, by choice. Verification is
  `npm run typecheck`, `npm run lint`, and manual testing against hosted.
  Don't add a test framework without asking.
- PowerShell is the user's shell, not bash. Commands you hand over should use
  `curl.exe` explicitly and stay on one line (no `\` continuations).

## Layout
```
app/(app)/        signed-in routes: / (dashboard), /log, /health, /checkin,
                  /goals, /goals/new, /prizes, /settings, /settings/family,
                  /family/[userId]
                  + layout.tsx, loading.tsx, error.tsx, and a per-route
                    loading.tsx for each of the above
app/(auth)/       /login, /invite/[token]
app/onboarding/   /onboarding/create-family  (outside both groups)
app/auth/callback/route.ts   magic-link callback — sets session cookies
lib/actions/      Server Actions, one file per domain (auth, goals, health,
                  onboarding, family-invites, family-prizes,
                  notifications, push-subscriptions)
lib/data/         server-side read helpers for Server Components
                  (checkin-status, health)
lib/supabase/     server.ts | client.ts | middleware.ts
lib/utils/        dates, health, progress, push, timezones
lib/types/        generated database.types.ts
components/       auth, checkins, family, goals, health, layout, onboarding,
                  settings, ui
supabase/functions/  apply-goal-change, monthly-prize-calculation,
                  monthly-target-snapshot, notify-activity,
                  send-family-invite
```
`components/ui/` currently holds `alert`, `blueprint-corners`, `button`,
`card`, `dialog`, `empty-state`, `field`, `line-chart`, `progress-bar`,
`segmented-control`, `skeleton`.

`/log` is the single entry point for recording anything — goal check-ins,
body, vitals, sleep, activity, custom metrics. There is no quick-check-in
modal any more; don't add a second logging path.

## Stack
- Next.js App Router on Vercel; Supabase for Postgres, Auth (email magic link;
  Google OAuth deferred, not built), Realtime, and Edge Functions (Deno).
- Realtime is enabled on `checkins` / `reactions` / `comments`.
- Styling: Tailwind, neutral grays + one accent, light mode only, mobile-first.
  Phase 7 is the real design pass.

## Environment variables
Next.js (`.env.local` locally, Vercel project settings in prod — there is no
`.env.example`, so ask rather than guess):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — client-side push subscribe
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, see Security

Edge Function secrets (`supabase secrets set`): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`,
`RESEND_FROM_ADDRESS`, `SITE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

The pg_cron jobs read the service role key from Supabase Vault
(`service_role_key` secret), never hardcoded in a migration.

## Hard constraints — do not silently change these
- One family per user. No multi-family membership, no join table for it.
- Reactions are like-only. No reaction type enum, no emoji picker.
- Month targets are computed **only** by Edge Functions — never on the client,
  never as a static column on `goals`. New goals get a non-prorated full-month
  target (`monthly-target-snapshot`). Frequency changes on an existing goal
  take effect immediately (changed from the original "next month only" rule,
  per user decision) via `apply-goal-change`, which *blends* the current
  month's target (old frequency × days-elapsed/7 + new frequency ×
  days-remaining/7) rather than replacing it with a fresh full-month figure.
- Monthly prizes: everyone at or above 100% wins. No single-winner logic, no
  tiebreakers.
- Check-ins are editable/deletable only within 24 hours of `created_at`.
  Enforce in RLS, not just the UI.
- Signup is invite-only. No open family-code join flow.
- Timezone is per-user (`profiles.timezone`), not per-family or device-local.
- **Personal health logs are private by default.** `health_logs`,
  `personal_metrics`, `personal_metric_entries` are readable only by their
  owner unless that owner sets `profiles.health_visibility = 'family'`.
  Writes are owner-only in every case, sharing or not. Don't route health
  data through the family feed, the summary bars, or prize math — it is a
  separate system from goals/checkins on purpose.
- No unit conversion anywhere. `profiles.weight_unit` and `checkins.distance`
  are display labels; stored numbers are whatever the user typed.
- `personal_metrics.target_value` is a flat user-entered number, unrelated to
  `goal_monthly_targets.target`. The Edge-Functions-only rule is about the
  latter and still holds.

## Security
RLS is the source of truth for family-scoped access. Every new table needs a
policy before it ships, not after.

- **Run new tables and policies past the rls-security-reviewer subagent before
  calling a schema change done.** A schema derived from the plan still needs
  its own review pass — this caught `goal_templates` shipping with no RLS
  policy at all, and reaction/comment policies that never verified `checkin_id`
  belonged to the caller's family. Both fixed.
- **A Server Action that forwards a client-supplied ID into a service-role
  Edge Function must verify ownership itself** — an RLS-governed `select`
  before the call, never trusting the ID. Server Actions are directly callable
  by any authenticated client with arbitrary arguments, not just through the UI
  flow that "normally" calls them. See `applyGoalChange` in `lib/actions/goals.ts`
  and `send-family-invite` (which takes only an `inviteId` and looks up the
  destination email and token server-side). Check for this shape on every new
  Server-Action-to-Edge-Function path.
- **Service role key** belongs only in Edge Functions, Server Actions
  (`lib/actions/`), and Vault. Never in a Client Component or the browser bundle.
- **`notify-activity` is deployed with `verify_jwt = false`** (see
  `supabase/config.toml`), so its own `apikey` check via
  `withSupabase({ auth: ["secret"] })` is the *only* thing between it and the
  public internet. Curl-tested: no key / garbage key / anon key all 401.
  Re-verify after any change to how it's deployed or to `@supabase/server`.
- **Read and write are different conditions on the health tables**, so they
  get separate policies, never one `for all`. A `for all using
  (health_owner_visible_to_me(user_id))` would let a family member edit or
  delete someone else's health rows the moment that person opted into
  sharing. Also: `health_owner_visible_to_me` is fail-closed for a
  family-less user only because `p.family_id = current_family_id()` is NULL
  rather than true — rewriting that as `is not distinct from`, or
  `coalesce`-ing `current_family_id()`, silently opens a cross-tenant read.
- **Realtime RLS enforcement is still unverified** on this project.
  `ActivityFeed` filters incoming events against the known family member list
  client-side as defense-in-depth. Note that PostgREST-level cross-family
  isolation *has* now been exercised (Phase 7, health tables) using a
  throwaway two-family harness built with the Admin API — see
  [[hosted-supabase-script]]; the same harness shape is what Realtime needs
  to finally be tested with.
- **Cross-directory imports into Edge Functions are allowed but constrained.**
  `monthly-prize-calculation` imports `lib/utils/progress.ts` via a relative
  path and `supabase functions deploy` bundles it automatically — no `_shared/`
  copy, no `--use-api` flag. Safe only because `progress.ts` is pure, zero-import
  TypeScript. Before reusing this for any other `lib/` file, confirm it has zero
  transitive deps (no `next/headers`, no `server-only`, no env reads).
- Background on the pg_net/Vault tradeoff for `notify-activity` triggers, and
  on Resend domain deliverability, lives in the build plan.

## Conventions
- Server Components by default. Client Components only where interaction
  requires it (check-in form, reaction buttons, realtime feed).
- Supabase client: `lib/supabase/server.ts` in Server Components/Actions,
  `lib/supabase/client.ts` in Client Components. Never mix them. Both are typed
  with the generated `Database` type — regenerate after every schema change.
- All dates go through `lib/utils/dates.ts` (`todayInTimezone`,
  `currentMonthInTimezone`) in the user's `profiles.timezone` — never bare
  `new Date()` for any day/month boundary logic.
- All progress math goes through `lib/utils/progress.ts` (`goalPercent`,
  `aggregatePercent`). `aggregatePercent` is the dashboard summary-bar formula
  **and** the formula `monthly-prize-calculation` must use — the build plan
  requires them to agree, so this is the single source of truth for both.
- Never seed initial `useState` from a browser-only read (e.g.
  `Intl.DateTimeFormat().resolvedOptions().timeZone`) in a server-rendered
  component — hydration mismatch, hit once in Phase 1 onboarding. Default to a
  static value and let the user pick.
- Built-in health metric definitions (labels, units, decimal-ness, min/max)
  live once in `lib/utils/health.ts` as `HEALTH_METRICS`. The min/max there
  mirror the DB check constraints — change both together. Client-side
  validation is for the error message; the constraint is the authority.
- **No charting library.** `components/ui/line-chart.tsx` is hand-rolled SVG
  and ships zero JS. It scales with `preserveAspectRatio="none"`, so every
  stroked path needs `vector-effect="non-scaling-stroke"` and **nothing with
  intrinsic proportions may go inside the SVG** — no `<text>`, no `<circle>`,
  no markers. Labels are HTML rendered around the chart.
- Every list/feed view gets `<EmptyState>`, not a bare `<p>No X yet</p>`, and
  the empty state names the next action where the user actually has one.
  Distinguish "never had data" from "nothing in this filter" — they want
  different actions.
- Loading states are skeletons shaped like the real content
  (`components/ui/skeleton.tsx`), one `loading.tsx` per route, not spinners.
- Failed mutations surface through `<Alert>` next to the control that failed.
  A client-side write that swallows its error is a bug — every
  `supabase.from(...)` call in a Client Component needs its error branch
  rendered somewhere.

## Commands
- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`
- `supabase db push` — apply migrations to hosted
- `supabase functions deploy <name>` — deploy an Edge Function
- `supabase gen types typescript --project-id krcuyqsmahavlahkpoyc > lib/types/database.types.ts`
  — after any schema change (note `--project-id`, not `--local`)

## Workflow
Build one phase of the roadmap at a time. Run the phase-gate-agent checklist at
the end of each phase. Don't start Phase N+1 work in a session with unresolved
Phase N issues.

Commits use Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`,
`docs:`, `test:`), scoped by area where it helps: `feat(goals):`, `fix(rls):`.

## Keeping this file accurate
This file is rules, not history. Narrative of what happened in a phase goes in
the build plan; what survives here is the rule that came out of it. When you
add an Edge Function, route, or `components/ui/` primitive, update the Layout
block in the same change — that block drifted badly once already.
