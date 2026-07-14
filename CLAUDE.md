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

## Commits
Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
Scope by area when it helps (`feat(goals): ...`, `fix(rls): ...`).

## Conventions
- Server Components by default; Client Components only where interaction
  requires it (check-in form, reaction buttons, realtime feed).
- Supabase client: `lib/supabase/server.ts` in Server Components/Actions,
  `lib/supabase/client.ts` in Client Components. Never mix them.
- All dates handled in the user's `profiles.timezone`, not server time or
  browser time, for check-in day boundaries.
