"use server";

// Fires the monthly-target-snapshot Edge Function so a brand-new goal gets
// a target row for the current month immediately, instead of waiting for
// the next cron run. Uses the service role key -- must only ever run
// server-side (Server Action), never in a Client Component.
export async function triggerTargetSnapshot() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/monthly-target-snapshot`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apiKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    if (!response.ok) {
      console.error(
        "monthly-target-snapshot failed",
        response.status,
        await response.text(),
      );
    }
  } catch (err) {
    // Best-effort: a goal is still valid without an immediate target row --
    // the next cron run will pick it up. Don't fail goal creation over this.
    console.error("monthly-target-snapshot request failed", err);
  }
}
