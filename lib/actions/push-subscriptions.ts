"use server";

import { createClient } from "@/lib/supabase/server";

type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Upserts a push subscription for the current user. user_id is always
// derived server-side from the authenticated session -- never trust a
// user_id passed from the client. Upsert on `endpoint` so re-subscribing
// from the same browser/device updates the existing row instead of
// duplicating it (endpoint has a unique constraint).
export async function upsertPushSubscription(
  subscription: PushSubscriptionInput,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("upsertPushSubscription failed", error);
    return { error: error.message };
  }

  return { error: null };
}

// Removes a push subscription by endpoint. RLS scopes this to the
// caller's own rows (user_id = auth.uid()), so no explicit user_id filter
// is required here, but the query still only ever affects rows the
// authenticated user owns.
export async function deletePushSubscription(endpoint: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) {
    console.error("deletePushSubscription failed", error);
    return { error: error.message };
  }

  return { error: null };
}
