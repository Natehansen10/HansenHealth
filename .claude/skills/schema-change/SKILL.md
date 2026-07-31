---
name: schema-change
description: Run the full hosted schema-change cycle for the Family Health Tracker — write a timestamped idempotent migration, push it to hosted, regenerate + re-encode the TypeScript types, and gate on RLS review. Use for any table/column/policy change so no step (especially the Windows UTF-8 re-encode and the RLS review) is skipped.
---

# Schema change cycle

Every schema change in this repo follows the same sequence. Skipping a step
has bitten this project before — a table shipped with no RLS policy, and the
regenerated types file shipped as UTF-16 with a BOM. This skill locks the
order.

There is **no local Docker**: migrations are applied directly to the **hosted**
project (`krcuyqsmahavlahkpoyc`). `supabase db reset` and `--local` are
unavailable.

## Step 1 — Write the migration

Consider handing the actual authoring to the `db-schema-agent` (it owns
migrations and RLS). Either way the file must be:

- Located in `supabase/migrations/`.
- Named `YYYYMMDDHHMMSS_short_description.sql`, timestamp **after** the newest
  existing migration (check with a glob of the folder first).
- **Idempotent**: `create table if not exists`, `add column if not exists`,
  `drop policy if exists` before `create policy`. Migrations may be re-run.
- Prefixed with a comment header: which phase / why, and any non-obvious
  reasoning (see existing migrations for the house style).

**Every new table needs an RLS policy in the same migration**, not a
follow-up. Family-scoped access is enforced by RLS, not the app. Recurring
gap: self-editable tables need a `with check` clause and column scoping, not
just a row-scoped `using` — see the `profiles` self-escalation lesson.

Also honor the hard constraints in CLAUDE.md — e.g. month targets are never a
static column on `goals`; check-in edit/delete is 24h-limited **in RLS**.

## Step 2 — Push to hosted

```
supabase db push
```

## Step 3 — Regenerate types, then re-encode (Windows gotcha)

`>` redirection in PowerShell writes the file as UTF-16 with a BOM, which
breaks the TS build. Regenerate, then re-encode to UTF-8 (no BOM). Note
`--project-id`, not `--local`.

```
supabase gen types typescript --project-id krcuyqsmahavlahkpoyc > lib/types/database.types.ts
```

Then, in one line:

```
powershell -Command "$c = Get-Content -Raw -Encoding Unicode 'lib/types/database.types.ts'; [System.IO.File]::WriteAllText((Resolve-Path 'lib/types/database.types.ts'), $c, (New-Object System.Text.UTF8Encoding $false))"
```

## Step 4 — RLS review gate (do not skip)

Run the **`rls-security-reviewer`** agent on the new/changed table(s) and
policies before calling the change done. A schema derived from the plan still
needs its own review pass — this is the step that caught the missing
`goal_templates` policy and the reaction/comment policies that never verified
`checkin_id` belonged to the caller's family.

## Step 5 — Verify it compiles and behaves

```
npm run typecheck
npm run lint
```

For behavior against real data, use [[hosted-supabase-script]] to exercise the
new columns/policies (insert as the owner → succeeds; as another family →
rejected), and clean up after.

## Checklist

- [ ] Timestamp is newest in `supabase/migrations/`
- [ ] Idempotent (`if not exists` / `drop ... if exists`)
- [ ] Comment header explaining what & why
- [ ] RLS policy present for any new table, with `with check` + column scope on
      self-editable tables
- [ ] `supabase db push` succeeded
- [ ] Types regenerated **and** re-encoded to UTF-8
- [ ] `rls-security-reviewer` ran and passed
- [ ] `typecheck` + `lint` clean

## Related

- [[hosted-supabase-script]] for exercising the change against hosted.
