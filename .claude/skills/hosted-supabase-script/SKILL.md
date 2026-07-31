---
name: hosted-supabase-script
description: Write and run a throwaway Node script against the HOSTED Supabase project (service-role) to verify behavior, seed test data, or inspect state. Use whenever you'd otherwise hand-write a one-off script to create/inspect/clean up rows against hosted — the standard verification loop in this repo, since there's no local Docker and no test runner.
---

# Hosted Supabase verification scripts

There is **no local Docker and no test runner** in this repo (see CLAUDE.md).
Verification means: write a small Node script that talks to the **hosted**
project with the service-role key, run it, read the result, then clean up any
rows you created. This skill makes that loop consistent instead of
reinventing the boilerplate each time.

## Rules

1. **Scripts are throwaway.** Write them to the scratchpad directory, never
   into the repo. Do not commit them.
2. **Service role bypasses RLS.** These scripts run as a superuser against the
   real family's data. Treat production data with care — scope every
   `select`/`update`/`delete` by an explicit id, never a blanket table op.
3. **Clean up what you create.** If a script inserts rows (checkins,
   reactions, comments, test profiles), write the matching cleanup in the same
   script or a sibling `cleanup-*.js`, and run it before you finish. Do not
   leave test rows in the hosted DB.
4. **Never print the service-role key** to output, and never paste it into a
   file that lands in the repo. It comes from `.env.local` at runtime.
5. Use the generated `Database` type is not required in throwaway JS scripts —
   plain `createClient()` is fine. Keep them small.

## The client boilerplate

Env keys (from `.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. Load them with Node's built-in `--env-file` so no
secret is ever written into the script file.

```js
// scratchpad/<task>.js  — run from the project root
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // service role — bypasses RLS
  { auth: { persistSession: false } },
);

// ... queries here ...
```

Run it (PowerShell, single line, from the project root so `.env.local`
resolves):

```
node --env-file=.env.local "<scratchpad>\<task>.js"
```

`<scratchpad>` is the session scratchpad path in the system prompt. If the
project uses CommonJS-only resolution and the ESM `import` errors, name the
file `.mjs` or switch to `const { createClient } = require("@supabase/supabase-js")`.

## Common recipes

**Look up the family + members** (you reuse these ids constantly):
```js
const { data: profiles } = await supabase
  .from("profiles")
  .select("id, display_name, family_id, timezone");
console.log(profiles);
```

**Create a test check-in, then clean it up:**
```js
const { data, error } = await supabase
  .from("checkins")
  .insert({ goal_id: GOAL_ID, user_id: USER_ID, /* ... */ })
  .select()
  .single();
console.log("created", data?.id, error);

// cleanup — always scope by the id you just made
await supabase.from("checkins").delete().eq("id", data.id);
```

**Verify a Server-Action ownership guard** (the invariant in CLAUDE.md
Security): call the action's underlying query the way a hostile client would —
with an id from a *different* family — and confirm RLS/ownership rejects it.

## After running

- State what you observed (the actual rows / error), not just "it worked."
- Confirm cleanup ran and the hosted DB is back to its prior state.
- Delete the scratchpad script if it has no further use.

## Related

- Schema changes go through [[schema-change]] first; regenerate types before
  writing scripts that depend on new columns.
- RLS behavior questions belong to the `rls-security-reviewer` agent.
