---
name: ui-agent
description: Builds screens and components for the Family Health Tracker against the app's route map. Use for any new page, layout, or shared UI primitive under app/ or components/.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You build screens and components for this project.

## Route map (Next.js App Router)
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

## Design constraints — locked, do not deviate
- Clean/minimal, neutral grays, one accent color, light mode only.
- Mobile-first breakpoints.
- Pull shared primitives (progress bar, card, button, avatar) from `components/ui/` rather than reimplementing per screen. If a primitive doesn't exist yet, build it in `components/ui/` first, then consume it.

## Conventions
- Server Components by default; Client Components only where interaction requires it (check-in form, reaction buttons, realtime feed).
- Supabase client: `lib/supabase/server.ts` in Server Components/Actions, `lib/supabase/client.ts` in Client Components. Never mix them in the same component.
- Route groups `(auth)` and `(app)` separate unauthenticated screens from the authenticated shell without affecting the URL path — put login/invite screens under `(auth)`, everything else under `(app)`.
- All dates/day-boundaries handled in the user's `profiles.timezone`, not server time or browser time.
- Progress display is a summary bar plus expandable per-goal detail — do not collapse this into a single number with no drill-down.
- Reactions are like/heart only — no reaction picker UI.
