"use server";

import { createClient } from "@/lib/supabase/server";

// Fires the send-family-invite Edge Function so the invite link actually
// reaches the invitee's inbox, instead of the admin having to copy/paste
// it manually. Uses the service role key -- must only ever run
// server-side (Server Action), never in a Client Component.
//
// Verifies the caller actually owns (is the inviter of) this invite before
// calling the Edge Function -- same lesson as applyGoalChange: a Server
// Action is directly callable with arbitrary arguments, so it must
// validate the referenced resource itself rather than trusting the
// caller's UI flow to have done the right thing first.
export async function sendFamilyInviteEmail(inviteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const { data: invite } = await supabase
    .from("family_invites")
    .select("id")
    .eq("id", inviteId)
    .eq("invited_by", user.id)
    .maybeSingle();

  if (!invite) {
    return { error: "You can only send invites you created." };
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-family-invite`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apiKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inviteId }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("send-family-invite failed", response.status, text);
      return { error: "Could not send the invite email." };
    }

    return { error: null };
  } catch (err) {
    console.error("send-family-invite request failed", err);
    return { error: "Could not send the invite email." };
  }
}
