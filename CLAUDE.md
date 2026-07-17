# Family Health Tracker

Web app for a family to track exercise goals together: set goals, check in,
see everyone's progress, react, comment, win a monthly prize.

## Status (updated end of Phase 4)
Phases 1-4 complete and manually verified against the live hosted Supabase
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
- **Next: Phase 5** — web push (VAPID + service worker), email (Resend),
  `notify-activity` Edge Function on DB webhook.

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
- Supabase Realtime's RLS enforcement on `postgres_changes` was not
  empirically verified against this specific project (no second family to
  test cross-tenant isolation with). `ActivityFeed` therefore filters
  incoming Realtime events against the known family member list
  client-side as defense-in-depth, in addition to whatever server-side
  enforcement Realtime provides. Revisit if a second family ever exists
  to test against.

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
