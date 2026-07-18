# Family Health Tracker

Web app for a family to track exercise goals together: set goals, check in,
see everyone's progress, react, comment, win a monthly prize.

## Status (updated end of Phase 6)
Phases 1-6 complete and manually verified against the live hosted Supabase
project. See `family-health-tracker-build-plan.md` for the full roadmap.
- **Phase 1**: schema, RLS, email magic-link auth, invite-only join flow.
  Google OAuth deferred (not yet built).
- **Phase 2**: goal templates, goal creation (template or custom), goal
  management (edit frequency, deactivate/reactivate).
- **Phase 3**: check-in logging with 24h edit/delete window,
  `monthly-target-snapshot` Edge Function (deployed, cron-scheduled daily
  at 00:10 UTC via pg_cron + Vault-stored service role key).
- **Phase 4**: dashboard with per-member summary bars (expandable to
  per-goal detail), live activity feed, likes, comments, `/family/[userId]`
  detail view. Realtime enabled on `checkins`/`reactions`/`comments`.
- **Phase 5**: notification preferences (`push_enabled`/`email_enabled`
  on `profiles`, opt-out defaults), web push (VAPID keypair, service
  worker at `public/sw.js`, subscribe/unsubscribe flow at `/settings`),
  email via Resend (`lydiaclarkhansen.com` verified sending domain),
  `notify-activity` Edge Function fired by `AFTER INSERT` triggers on
  `checkins`/`reactions`/`comments`. End-to-end tested: real check-in →
  push + email both delivered. See Security section below for the
  auth-boundary and secret-exposure notes specific to this phase.
- **Phase 6**: `monthly-prize-calculation` Edge Function (cron, 1st of
  month at 00:15 UTC), `/prizes` screen with current-month standings and
  prize history. End-to-end tested: a synthetic 100%-month scenario
  correctly awarded and displayed a prize, then was cleaned up.
- **Next: Phase 7** — mobile-first responsive pass, empty states, error
  handling, loading states, production deploy checklist.

## Environment
- **No local Docker** in this dev environment. `supabase db reset`,
  `supabase functions serve`, and `--local` type generation are
  unavailable. Everything is developed and tested directly against the
  **hosted** Supabase project (`krcuyqsmahavlahkpoyc`).
- `supabase/seed.sql` is kept in sync as the source of truth for local dev
  seeding, but doesn't actually run anywhere right now — seed data ships
  as a regular timestamped migration instead (see
  `20260713000003_seed_goal_templates.sql`), since `db reset` never runs.
- Edge Functions are tested by deploying to hosted and invoking with curl
  (service role key), not `functions serve`.
- `supabase/functions/**` is excluded from the Next.js `tsconfig.json` and
  `eslint.config.mjs` — it's Deno, not Node, and has its own module
  resolution. Don't try to make it part of the Next.js TS project.

## Stack
- Next.js (App Router), deployed on Vercel
- Supabase: Postgres, Auth (email magic link; Google OAuth deferred),
  Realtime, Edge Functions (Deno)
- Styling: Tailwind, neutral grays + one accent color, light mode only,
  mobile-first. Intentionally bare-bones through Phase 6 — real design
  pass is Phase 7. `components/ui/` has `Button`, `Card`, `ProgressBar`
  so far.

## Hard constraints — do not silently change these
- One family per user. No multi-family membership, no join table for it.
- Reactions are like-only. No reaction type enum, no emoji picker.
- New goals get a non-prorated full-month target, computed by the
  monthly-target-snapshot Edge Function. Frequency changes on an EXISTING
  goal now take effect immediately (changed from the original "next month
  only" rule, per user decision) via the `apply-goal-change` Edge
  Function: the current month's target is blended (old frequency ×
  days-elapsed/7 + new frequency × days-remaining/7), not simply replaced
  with a fresh full-month figure. Never compute month_target on the
  client or store it as a static column on `goals` — both Edge Functions
  are the only places this math happens.
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
  (`goal_monthly_targets`, `monthly_prizes` writes) and Next.js **Server
  Actions** (`lib/actions/`) — e.g. `triggerTargetSnapshot` calls the
  Edge Function server-side. Never expose it to a Client Component or the
  browser bundle. It also lives in Supabase Vault (`service_role_key`
  secret) for the pg_cron job, not hardcoded in any migration.
- Run new tables and policies past the rls-security-reviewer subagent
  before considering a schema change done. Two real gaps were found this
  way and fixed: `goal_templates` had no RLS policy at all (Phase 2), and
  `manage own reactions`/`manage own comments` didn't verify `checkin_id`
  belonged to the caller's own family (Phase 4) — both are fixed, but
  they're a reminder that a schema derived from a plan still needs its own
  review pass, not just a diff against the plan.
- Same rigor applies to a Server Action that forwards a client-supplied
  resource ID into a service-role Edge Function call — not just to new
  tables/RLS. `apply-goal-change` (the frequency-change target-blend
  feature) was the first case of this shape in the codebase: a Server
  Action is directly callable by any authenticated client with arbitrary
  arguments, not just via whatever UI flow "normally" calls it, so the
  Server Action itself must verify the caller owns the referenced
  resource (an RLS-governed `select` before calling the Edge Function)
  rather than trusting the ID blindly. Caught by rls-security-reviewer and
  fixed in `lib/actions/goals.ts`'s `applyGoalChange` — check for this
  pattern on any future Server-Action-to-service-role-Edge-Function call
  that takes a client-supplied ID.
- Supabase Realtime's RLS enforcement on `postgres_changes` was not
  empirically verified against this specific project (no second family to
  test cross-tenant isolation with). `ActivityFeed` therefore filters
  incoming Realtime events against the known family member list
  client-side as defense-in-depth, in addition to whatever server-side
  enforcement Realtime provides. Revisit if a second family ever exists
  to test against.
- `notify-activity` (Phase 5) is invoked via `AFTER INSERT` triggers on
  `checkins`/`reactions`/`comments` (`notify_activity_webhook()`,
  migration `20260717000006`) rather than Supabase's dashboard-configured
  Database Webhooks UI, so the wiring lives in a migration, not
  undeclared dashboard state. This means the live service role key (from
  Vault) is read into a `security definer` function and sent as an
  `apikey` header on every single check-in/reaction/comment insert, not
  just once a day like the `monthly-target-snapshot` cron job — a
  deliberate, reviewed tradeoff (the function can't be invoked directly;
  Postgres refuses to call a `returns trigger` function outside trigger
  context), but it does mean the secret transits pg_net's internal queue
  tables far more often. Revisit if pg_net's internal tables (`net.*`)
  are ever exposed to a broader set of roles.
- The `notify-activity` Edge Function itself is deployed with
  `verify_jwt = false` (see `supabase/config.toml`) — there is no
  platform-level auth backstop, so its own `apikey`-header check (via
  `withSupabase({ auth: ["secret"] })`) is the only thing standing
  between it and the public internet. This was empirically curl-tested
  (no key / garbage key / anon key all get 401; only the real service
  role key succeeds) before the webhook was wired up. Re-verify this
  after any change to how the function is deployed or to the
  `@supabase/server` package version.
- Resend sending domain (`lydiaclarkhansen.com`, a domain already used
  for an unrelated existing site, verified via Cloudflare DNS under the
  root domain rather than a subdomain) is brand new with no sending
  history, so early `notify-activity` emails land in recipients' spam
  folders — confirmed in first end-to-end test. Not a code issue;
  resolves as the domain builds sending reputation. The optional DMARC
  record Cloudflare/Resend offered was skipped (only SPF/DKIM were
  added) — consider adding it if spam placement doesn't improve.
- `monthly-prize-calculation` (Phase 6) imports `lib/utils/progress.ts`
  directly via a cross-directory relative import
  (`../../../lib/utils/progress.ts`), rather than duplicating the
  formula into `supabase/functions/_shared/`. This was empirically
  confirmed to work — `supabase functions deploy` bundles the imported
  file automatically, no `--use-api` flag or `_shared/` convention
  needed — but it's only safe because `progress.ts` is pure, zero-import
  TypeScript with no Node-specific APIs and no secrets. Before reusing
  this pattern for any other `lib/` file, manually confirm it has zero
  transitive dependencies (no `next/headers`, no `server-only`, no env
  reads) — otherwise the Edge Function bundle could pull in server-only
  Next.js code or fail confusingly under Deno.

## Commands
- `npm run dev` — local dev server
- `npm run build` / `npm run lint` / `npm run typecheck`
- `supabase db push` — apply migrations to the hosted project
- `supabase functions deploy <name>` — deploy an Edge Function (no local
  `functions serve` — see Environment above)
- `supabase gen types typescript --project-id krcuyqsmahavlahkpoyc > lib/types/database.types.ts`
  — regenerate types after any schema change (note: `--project-id`, not
  `--local`)

## Workflow
Build one phase of the roadmap at a time (see build plan doc). At the end
of each phase, run the phase-gate-agent checklist before starting the next
phase. Do not start Phase N+1 work inside the same session as unresolved
Phase N issues.

## Commits
Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
Scope by area when it helps (`feat(goals): ...`, `fix(rls): ...`).

## Conventions
- Server Components by default; Client Components only where interaction
  requires it (check-in form, reaction buttons, realtime feed).
- Supabase client: `lib/supabase/server.ts` in Server Components/Actions,
  `lib/supabase/client.ts` in Client Components. Never mix them. Both are
  typed with the generated `Database` type from `lib/types/database.types.ts`
  — regenerate after every schema change, don't let it drift.
- All dates handled in the user's `profiles.timezone`, not server time or
  browser time. Use `lib/utils/dates.ts` (`todayInTimezone`,
  `currentMonthInTimezone`) rather than `new Date()` directly for any
  check-in day/month boundary logic.
- Goal/family progress percentages: use `lib/utils/progress.ts`
  (`goalPercent`, `aggregatePercent`) rather than reimplementing the
  math. `aggregatePercent` (average of each active goal's capped percent)
  is the dashboard summary-bar formula **and** must be the exact formula
  Phase 6's `monthly-prize-calculation` uses — the build plan requires
  them to agree, so this is the shared source of truth for both.
- Client-side browser-only reads (e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone`)
  must never seed initial `useState` in a component that's server-rendered
  — causes a hydration mismatch (hit this once in Phase 1's onboarding
  forms). Default to a static value and let the user pick manually instead
  of auto-detecting in a `useEffect`, unless you have a specific reason to
  fight the extra complexity.
- PowerShell is the user's shell, not bash — when giving them commands to
  run (e.g. curl for testing an Edge Function), use `curl.exe` explicitly
  and one-line commands (no `\` line continuation, which is bash-only).
