// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import webpush from "web-push";

// Trigger: Supabase Database Webhook on INSERT to checkins, reactions,
// comments (wired separately, in its own migration -- not part of this
// change). Fans out to family members (excluding the actor) via web push
// and/or email, according to each recipient's push_enabled/email_enabled
// preference on profiles.
//
// Auth: secret key only (service role). This function is invoked by
// Supabase's DB webhook mechanism, not by user-facing code or a Server
// Action -- but it's still not meant to be publicly invokable, so it
// requires the same "secret" apiKey credential as monthly-target-snapshot.
// The webhook itself must be configured to send an `apikey` header with
// the service role key (see supabase/config.toml webhook setup, done
// separately). This function performs no RLS-bypassing writes other than
// deleting expired push_subscriptions rows -- everything else is reads
// (profiles, goals, checkins) needed to resolve recipients and build
// notification copy.

type WebhookTable = "checkins" | "reactions" | "comments";

interface WebhookPayload {
  type: "INSERT";
  table: WebhookTable;
  schema: string;
  record: Record<string, unknown>;
  old_record: null;
}

interface Recipient {
  id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  full_name: string;
}

interface NotificationContent {
  // Web push payload -- shape must match public/sw.js's expectations.
  title: string;
  body: string;
  url: string;
  // Email content.
  subject: string;
  emailBody: string;
}

const VAPID_SUBJECT = "mailto:natehans10@gmail.com";
const DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";

export default {
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    let payload: WebhookPayload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    if (payload.type !== "INSERT") {
      // We only wire this function for INSERT events, but guard anyway.
      return Response.json({ skipped: "not an insert event" });
    }

    const { table, record } = payload;
    const actorId = record.user_id as string | undefined;

    if (!actorId) {
      return Response.json({ error: "record missing user_id" }, {
        status: 400,
      });
    }

    // 1. Resolve the actor's family and name.
    const { data: actor, error: actorError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, family_id, full_name")
      .eq("id", actorId)
      .single();

    if (actorError || !actor || !actor.family_id) {
      return Response.json(
        { error: actorError?.message ?? "actor not found or has no family" },
        { status: 200 }, // don't make the webhook retry forever on a bad row
      );
    }

    // 2. Build the notification content for this event type.
    const content = await buildContent(ctx.supabaseAdmin, table, record, actor.full_name);

    if (!content) {
      return Response.json({ skipped: "could not build notification content" });
    }

    // 3. Resolve recipients: everyone in the family except the actor, with
    // at least one notification channel enabled.
    const { data: recipients, error: recipientsError } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id, push_enabled, email_enabled, full_name")
      .eq("family_id", actor.family_id)
      .neq("id", actorId)
      .or("push_enabled.eq.true,email_enabled.eq.true");

    if (recipientsError) {
      return Response.json({ error: recipientsError.message }, { status: 500 });
    }

    if (!recipients || recipients.length === 0) {
      return Response.json({ notified: 0 });
    }

    const pushRecipients = (recipients as Recipient[]).filter((r) => r.push_enabled);
    const emailRecipients = (recipients as Recipient[]).filter((r) => r.email_enabled);

    const results = await Promise.allSettled([
      sendPushNotifications(ctx.supabaseAdmin, pushRecipients, content),
      sendEmailNotifications(emailRecipients, content),
    ]);

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => String(r.reason));

    return Response.json({
      notified: recipients.length,
      pushRecipients: pushRecipients.length,
      emailRecipients: emailRecipients.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  }),
};

// deno-lint-ignore no-explicit-any
async function buildContent(
  supabaseAdmin: any,
  table: WebhookTable,
  record: Record<string, unknown>,
  actorName: string,
): Promise<NotificationContent | null> {
  switch (table) {
    case "checkins": {
      const goalId = record.goal_id as string;
      const { data: goal } = await supabaseAdmin
        .from("goals")
        .select("title")
        .eq("id", goalId)
        .single();

      const goalTitle = goal?.title ?? "a goal";
      return {
        title: "New check-in",
        body: `${actorName} logged a check-in for ${goalTitle}`,
        url: `/family/${record.user_id}`,
        subject: `${actorName} logged a check-in`,
        emailBody: `${actorName} logged a check-in for ${goalTitle}.`,
      };
    }

    case "reactions": {
      const checkinId = record.checkin_id as string;
      const { checkinOwnerName, goalTitle } = await lookupCheckinContext(
        supabaseAdmin,
        checkinId,
      );

      return {
        title: "New like",
        body: `${actorName} liked ${checkinOwnerName}'s check-in${goalTitle ? ` for ${goalTitle}` : ""}`,
        url: `/family/${record.user_id}`,
        subject: `${actorName} liked a check-in`,
        emailBody: `${actorName} liked ${checkinOwnerName}'s check-in${goalTitle ? ` for ${goalTitle}` : ""}.`,
      };
    }

    case "comments": {
      const checkinId = record.checkin_id as string;
      const { checkinOwnerName, goalTitle } = await lookupCheckinContext(
        supabaseAdmin,
        checkinId,
      );
      const body = (record.body as string) ?? "";
      const preview = body.length > 140 ? `${body.slice(0, 140)}...` : body;

      return {
        title: "New comment",
        body: `${actorName} commented on ${checkinOwnerName}'s check-in: "${preview}"`,
        url: `/family/${record.user_id}`,
        subject: `${actorName} commented on a check-in`,
        emailBody: `${actorName} commented on ${checkinOwnerName}'s check-in${goalTitle ? ` for ${goalTitle}` : ""}:\n\n"${preview}"`,
      };
    }

    default:
      return null;
  }
}

// deno-lint-ignore no-explicit-any
async function lookupCheckinContext(supabaseAdmin: any, checkinId: string) {
  const { data: checkin } = await supabaseAdmin
    .from("checkins")
    .select("user_id, goal_id, profiles(full_name), goals(title)")
    .eq("id", checkinId)
    .single();

  return {
    checkinOwnerName: checkin?.profiles?.full_name ?? "a family member",
    goalTitle: checkin?.goals?.title ?? null,
  };
}

async function sendPushNotifications(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  recipients: Recipient[],
  content: NotificationContent,
): Promise<void> {
  if (recipients.length === 0) return;

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error("VAPID keys not configured -- skipping push notifications");
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey);

  const { data: subscriptions, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in(
      "user_id",
      recipients.map((r) => r.id),
    );

  if (error || !subscriptions || subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({
    title: content.title,
    body: content.body,
    url: content.url,
  });

  await Promise.all(
    // deno-lint-ignore no-explicit-any
    subscriptions.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone/expired -- clean it up so we don't keep
          // failing on it forever. This is the one legitimate write this
          // function performs, and it needs service role since it spans
          // all users' subscriptions, not just the caller's own row.
          await supabaseAdmin
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
        } else {
          console.error("web push send failed", sub.id, err);
        }
      }
    }),
  );
}

async function sendEmailNotifications(
  recipients: Recipient[],
  content: NotificationContent,
): Promise<void> {
  if (recipients.length === 0) return;

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("RESEND_API_KEY not configured -- skipping email notifications");
    return;
  }

  const fromAddress = Deno.env.get("RESEND_FROM_ADDRESS") || DEFAULT_FROM_ADDRESS;

  // Recipients here are profiles, which don't carry email addresses --
  // auth.users does. Resolve via the admin auth API.
  await Promise.all(
    recipients.map(async (recipient) => {
      const email = await lookupEmailForUser(recipient.id);
      if (!email) return;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [email],
            subject: content.subject,
            html: `<p>${escapeHtml(content.emailBody).replace(/\n/g, "<br/>")}</p>`,
            text: content.emailBody,
          }),
        });

        if (!res.ok) {
          console.error("Resend send failed", recipient.id, await res.text());
        }
      } catch (err) {
        console.error("Resend request failed", recipient.id, err);
      }
    }),
  );
}

// Comment/goal text is free-form user input reflected into email HTML --
// escape it so a family member can't inject markup (fake links, tracking
// pixels) into another member's inbox.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function lookupEmailForUser(userId: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("missing SUPABASE_URL or service role key for auth admin lookup");
    return null;
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!res.ok) {
    console.error("auth admin user lookup failed", userId, res.status);
    return null;
  }

  const user = await res.json();
  return user?.email ?? null;
}
