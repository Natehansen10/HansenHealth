# Family Health Tracker: ACC 556 final project app

A small web app on top of the 3NF schema in the **"ACC556 Final Project"** Supabase project.
It is separate from the production app in the repo root, with its own database, its own
dependencies, and its own deploy.

**Why it exists:** my dad had a heart transplant, and his recovery runs on daily habits:
weigh-ins, blood pressure, medications, walks. This app lets the whole family take part.
Everyone sets a health goal, checks in, and sees everyone's progress on one family board.

**Win condition:** pick a family and a month, see every member's check-ins against their
calculated monthly target, ranked by completion rate, and award the month's prize to the
top member(s). Ties share the prize.

## What's in here

| Path | What it is |
| --- | --- |
| `sql/01_schema_and_data.sql` | Schema (6 tables, 1 view, 3NF) and sample data. 10 people, 3 families, 14 goals, 405 check-ins. |
| `sql/02_verify.sql` | Six integrity checks (no orphans, no check-ins outside a goal's dates, targets, prize winners). |
| `sql/03_lock_down_api.sql` | Turns off Supabase's public table API for these tables. Run after every run of 01. |
| `sql/04_showcase_query.sql` | The query for the video: completion rate, `RANK()` within family, `LAG()` month over month. |
| `lib/queries.ts` | Every read the app makes, as plain SQL. |
| `app/actions.ts` | Every write: log/delete a check-in, add/end/delete a goal, award a prize. |
| `app/page.tsx` | Leaderboard (the win condition). |
| `app/members/` | Member list and member detail (log check-ins, history, goals). |

## How it fits together

The browser never talks to the database. Pages are React Server Components that run SQL on the
server through one connection pool (`lib/db.ts`, the `postgres` library). Forms post to Server
Actions, which validate the input, write inside a transaction, then re-render the page. The
connection string lives only in the `DATABASE_URL` environment variable.

Monthly targets are never stored. A goal has a weekly frequency, a `start_date`, and an
`end_date` (empty while it is running). The view `v_goal_monthly_targets` lists every month
each goal was running and calculates `ROUND(frequency × days_in_month / 7)`.

### The rules (small on purpose)

| Rule | Why |
| --- | --- |
| A goal's times-per-week can't be edited. To change it, end the goal and add a new one. | Old months keep the frequency they had, with no snapshot table. Dana's meditation in the sample data shows this. |
| A goal counts for the full month in every month it runs. | One formula, easy to check by hand. |
| A goal with check-ins can be ended, not deleted. A goal with no check-ins can be deleted. | History stays; mistakes are easy to undo. |
| Check-ins can be logged or deleted for today or yesterday only. | Past months stop changing, so an awarded prize matches the board. |
| One check-in per goal per day (`UNIQUE (goal_id, checkin_date)`). | No double counting. |
| The prize can be awarded once the month is over. Highest completion rate wins; ties share. | `RANK()` gives tied members the same place. |

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

5. Open http://localhost:3000. The footer should read "Live from Supabase: 10 members · 14 goals · 405 check-ins".

Checks before you commit: `npm run typecheck` and `npm run lint`.

## Deploy (Phase 5: the professor needs a link)

1. Vercel: **Add New > Project**, import this repo.
2. Set **Root Directory** to `acc556`.
3. Add the environment variable `DATABASE_URL` (same pooler URI).
4. Deploy. No login is needed to use the app.

## Phase 4 video outline (2 to 3 minutes)

Record after re-running `01` then `03`, so the data is clean.

1. **Open the app** (15s). One sentence on why: Dad's heart transplant, daily recovery habits,
   and the family doing it with him. Leaderboard, Hansen family, November.
2. **Show the database connection** (15s). Point at the live footer count (405 check-ins), then
   show the `checkins` table in the Supabase Table Editor.
3. **Win condition** (60 to 90s):
   - Sep 2026: Hansen, Cole won. Clark, Ngozi and Amara tied at 100% and both won.
   - Oct 2026, Hansen: the prize isn't awarded yet. Click **Award Oct 2026 prize**. Dana wins at 93.5%.
   - Open Ella Hansen, log today's "Walk the dog" check-in. The footer goes to 406 and her
     November bar moves.
   - Try a date three days back: it is refused (today or yesterday only).
   - Open Dana Hansen: her old 3-per-week meditation goal shows "Ended Sep 30" and the new
     4-per-week one started Oct 1. That's how a frequency change works without rewriting history.
4. **SQL you're proud of** (30 to 45s). Run `sql/04_showcase_query.sql` in the SQL Editor.
   Explain the view (`generate_series` lists each goal's months), the CTEs, `RANK()` (ties share
   a place) and `LAG()` (change from last month).
5. **What's left** (15 to 30s). A second report page (month-over-month trends), polish on empty
   states and errors, fresh check-ins through the end of November, and the writeup.

To re-record from a clean state, re-run `01` then `03`.

## Known limits (honest list)

- No login. Anyone with the link can log or delete check-ins. All data is fictional, but a real
  version needs Supabase Auth and per-family access rules.
- Sample check-ins stop on Nov 16, so November rates look low until the month fills in.
- Prizes are awarded by a button, not automatically on the 1st of the month.
- Check-ins record that a habit happened, not a measurement. Weight or blood pressure goes in
  the note for now.
- Only one report so far (the leaderboard). The month-over-month query exists in SQL but isn't a page yet.
- No route-level loading skeleton. With Next.js 16.2.10, a root `loading.tsx` made Server
  Action responses hang the form on "Saving…" in production builds (reproduced, then removed).
