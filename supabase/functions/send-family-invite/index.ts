// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Sends the invite-link email via Resend right after a family_invites row
// is created (called from lib/actions/family-invites.ts, a Server Action,
// right after the client inserts the invite row).
//
// Takes only an inviteId -- looks up the real email/token/family/inviter
// server-side rather than trusting client-supplied values for any of them,
// same lesson as apply-goal-change: a client-invoked path into a
// service-role Edge Function must not blindly trust content the caller
// could have tampered with (here, the destination email address and the
// token in the link -- sending to an attacker-supplied address, or with a
// forged token, would be a real problem even in a closed family app).
//
// Auth: secret key only (service role, bypasses RLS). Never callable with
// a publishable key -- this must not be reachable from a browser.
const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";

export default {
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    let body: { inviteId?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    const { inviteId } = body;
    if (!inviteId) {
      return Response.json({ error: "inviteId is required" }, { status: 400 });
    }

    const { data: invite, error: inviteError } = await ctx.supabaseAdmin
      .from("family_invites")
      .select(
        "email, token, status, family_id, invited_by, families(name), profiles(full_name)",
      )
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      return Response.json(
        { error: inviteError?.message ?? "invite not found" },
        { status: 200 }, // don't retry forever on a bad/deleted invite
      );
    }

    if (invite.status !== "pending") {
      return Response.json({ skipped: "invite is not pending" });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured -- cannot send invite email");
      return Response.json({ error: "email not configured" }, { status: 500 });
    }

    const fromAddress = Deno.env.get("RESEND_FROM_ADDRESS") || DEFAULT_FROM_ADDRESS;
    const siteUrl = Deno.env.get("SITE_URL");
    if (!siteUrl) {
      console.error("SITE_URL not configured -- cannot build an invite link");
      return Response.json({ error: "site URL not configured" }, { status: 500 });
    }

    const familyName = firstOf(invite.families)?.name ?? "your family";
    const inviterName = firstOf(invite.profiles)?.full_name ?? "A family member";
    const inviteUrl = `${siteUrl}/invite/${invite.token}`;

    const subject = `You're invited to join ${familyName} on Family Health Tracker`;
    const emailBody =
      `${inviterName} invited you to join ${familyName} on Family Health Tracker, ` +
      `an app for tracking exercise goals together as a family.\n\n` +
      `This invite expires in 7 days.`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [invite.email],
          subject,
          html:
            `<p>${escapeHtml(emailBody).replace(/\n/g, "<br/>")}</p>` +
            `<p><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>`,
          text: `${emailBody}\n\n${inviteUrl}`,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Resend send failed", text);
        return Response.json({ error: "email send failed" }, { status: 500 });
      }

      return Response.json({ sent: true });
    } catch (err) {
      console.error("Resend request failed", err);
      return Response.json({ error: "email send failed" }, { status: 500 });
    }
  }),
};

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// Family/inviter names are user-controlled data reflected into email HTML
// -- escape them so a family member can't inject markup into an invitee's
// inbox (same lesson as notify-activity's escapeHtml).
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
