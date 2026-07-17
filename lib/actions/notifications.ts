"use server";

import { createClient } from "@/lib/supabase/server";

type NotificationPreferences = {
  push_enabled?: boolean;
  email_enabled?: boolean;
};

// Updates only push_enabled/email_enabled on the caller's own profile row.
// Never spread a full form/profile object into `.update()` -- the
// BEFORE UPDATE trigger on profiles blocks role/family_id changes, but we
// keep the update surface minimal as a matter of practice regardless.
export async function updateNotificationPreferences(
  prefs: NotificationPreferences,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const update: NotificationPreferences = {};
  if (typeof prefs.push_enabled === "boolean") {
    update.push_enabled = prefs.push_enabled;
  }
  if (typeof prefs.email_enabled === "boolean") {
    update.email_enabled = prefs.email_enabled;
  }

  if (Object.keys(update).length === 0) {
    return { error: null };
  }

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);

  if (error) {
    console.error("updateNotificationPreferences failed", error);
    return { error: error.message };
  }

  return { error: null };
}
