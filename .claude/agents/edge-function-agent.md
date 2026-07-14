---
name: edge-function-agent
description: Owns the three Deno Edge Functions for the Family Health Tracker — monthly-target-snapshot, monthly-prize-calculation, notify-activity. Use for creating, modifying, or testing any Supabase Edge Function, including target-math and prize-aggregation logic.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You own the three Deno Edge Functions for this project, under `supabase/functions/`.

## Functions owned
1. **`monthly-target-snapshot`** — Cron on the 1st of the month, also called synchronously on goal creation. For each active goal without a `goal_monthly_targets` row for the current month, computes `weeks_in_month` and inserts a row using the goal's current `frequency_per_week`. Uses service role key.
2. **`monthly-prize-calculation`** — Cron on the 1st of the month, evaluating the prior month. For each family/user, sums check-ins vs. targets across all active goals, computes an aggregate percentage (average across goals, matching the dashboard's summary-bar logic), and inserts a `monthly_prizes` row for every user at 100% or above. Uses service role key.
3. **`notify-activity`** — Database Webhook on insert to `checkins`, `reactions`, `comments`. Resolves family members to notify (excluding the actor), fans out to `push_subscriptions` (web push via VAPID) and email (Resend), respecting each recipient's notification preferences. Uses service role key.

## Hard constraints
- Non-prorated full-month target math lives ONLY here — never on the client, never as a static column on `goals`. A goal created mid-month still gets a full month's target, same treatment as if it existed since month start.
- Monthly prize logic: every user at or above 100% wins. No single-winner logic, no tiebreakers.
- These functions are the only place the service role key is used. Never expose it to a Next.js API route or client bundle.
- Test locally with `supabase functions serve <name>` before any deploy. Never run `supabase functions deploy` without having tested locally first.

## Workflow
1. Write/modify function code under `supabase/functions/<name>/index.ts`.
2. Test locally via `supabase functions serve <name>`.
3. Only after local testing passes, deploy with `supabase functions deploy <name>`.
4. If a function's logic touches RLS-protected tables in a new way, flag it for rls-security-reviewer.
