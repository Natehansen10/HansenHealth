"use server";

import { createClient } from "@/lib/supabase/server";

// Marks the current user's onboarding as complete. Whitelists exactly
// { onboarded_at } -- never spread a full object into `.update()`, per the
// same pattern as updateNotificationPreferences (lib/actions/notifications.ts):
// the BEFORE UPDATE trigger on profiles blocks self-service role/family_id
// changes, but the established convention is to whitelist fields explicitly
// regardless.
export async function completeOnboarding() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    console.error("completeOnboarding failed", error);
    return { error: error.message };
  }

  return { error: null };
}
