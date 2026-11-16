# Family Health Tracker: ACC 556 final project app

A small web app on top of the 3NF schema in the **"ACC556 Final Project"** Supabase project.
It is separate from the production app in the repo root, with its own database, its own
dependencies, and its own deploy.

**Win condition:** pick a family and a month, see every member's check-ins against their
calculated monthly target, ranked by completion rate, and award the month's prize to the
top member(s). Ties share the prize.

## What's in here

| Path | What it is |
| --- | --- |
| `sql/01_schema_and_data.sql` | Phase 3 schema (3NF) and sample data. 10 people, 3 families, 13 goals, 253 check-ins. |
| `sql/02_verify.sql` | Integrity checks. Check 2 is fixed to compare dates in each owner's timezone. |
| `sql/03_lock_down_api.sql` | Turns off Supabase's public table API for these tables. Run after every run of 01. |
| `sql/04_showcase_query.sql` | The query for the video: completion rate, `RANK()` within family, `LAG()` month over month. |
| `lib/queries.ts` | Every read the app makes, as plain SQL. |
| `app/actions.ts` | Every write: log/delete a check-in, add/pause a goal, award a prize. |
| `app/page.tsx` | Leaderboard (the win condition). |
| `app/members/` | Member list and member detail (log check-ins, history, goals). |

## How it fits together

The browser never talks to the database. Pages are React Server Components that run SQL on the
server through one connection pool (`lib/db.ts`, the `postgres` library). Forms post to Server
Actions, which validate the input, write inside a transaction, then re-render the page. The
connection string lives only in the `DATABASE_URL` environment variable.

Monthly targets are never stored. `goal_monthly_targets` stores each goal's weekly frequency for
the month, and the view `v_goal_monthly_targets` calculates `ROUND(frequency × days_in_month / 7)`.
The first write in a new month snapshots every active goal for that month, so editing a goal
later never rewrites history.

## Set up (Windows PowerShell)

1. In Supabase, open the **ACC556 Final Project** project, then the SQL Editor. Run
   `sql/01_schema_and_data.sql`, then `sql/03_lock_down_api.sql`.
2. In Supabase, click **Connect**, choose **Transaction pooler**, and copy the URI. Replace
   `[YOUR-PASSWORD]` with the database password.
3. Copy the example env file, then paste the URI into `.env.local` as `DATABASE_URL`:

```bash
cd acc556; Copy-Item .env.example .env.local; notepad .env.local
```

4. Install and run:

```bash
npm install
```

```bash
npm run dev
```

5. Open http://localhost:3000. The footer should read "Live from Supabase: 10 members · 13 goals · 253 check-ins".

Checks before you commit: `npm run typecheck` and `npm run lint`.

## Deploy (Phase 5: the professor needs a link)

1. Vercel: **Add New > Project**, import this repo.
2. Set **Root Directory** to `acc556`.
3. Add the environment variable `DATABASE_URL` (same pooler URI).
4. Deploy. No login is needed to use the app.

## Phase 4 video outline (2 to 3 minutes)

1. **Open the app** (15s). Leaderboard, Hansen family, October.
2. **Show the database connection** (15s). Point at the live footer count, then show the
   `checkins` table in the Supabase Table Editor.
3. **Win condition** (60 to 90s):
   - Hansen, Sep 2026: Cole won. Clark, Sep 2026: Ngozi and Amara tied at 100% and both won.
   - Hansen, Oct 2026: the prize isn't awarded yet. Click **Award Oct 2026 prize**. Cole wins at 61.5%.
   - Open Sam Hansen, log today's vegetable check-in. The footer goes to 254 and the November
     leaderboard updates.
   - Try a check-in dated in October: it is refused because October's prize closed the month.
4. **SQL you're proud of** (30 to 45s). Run `sql/04_showcase_query.sql` in the SQL Editor.
   Explain the CTEs, `RANK()` (ties share a place) and `LAG()` (change from last month).
5. **What's left** (15 to 30s). See below.

To re-record from a clean state, re-run `01` then `03`.

## Known limits (honest list)

- No login. Anyone with the link can log or delete check-ins. All data is fictional, but a real
  version needs Supabase Auth and per-family access rules.
- Sample check-ins stop on Oct 20 (the Phase 3 due date), so October rates look low.
- Prizes are awarded by a button, not automatically on the 1st of the month.
- Only one report so far (the leaderboard). The month-over-month query exists in SQL but isn't a page yet.
- No route-level loading skeleton. With Next.js 16.2.10, a root `loading.tsx` made Server
  Action responses hang the form on "Saving…" in production builds (reproduced, then removed).
