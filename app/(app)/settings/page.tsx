import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { PushSubscribeButton } from "@/components/settings/push-subscribe-button";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("push_enabled, email_enabled, timezone, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">
        Settings
      </h1>

      <Card className="mb-6">
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Timezone
        </h2>
        <p className="text-sm text-muted">{profile.timezone}</p>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Notifications
        </h2>
        <NotificationPreferencesForm
          initialPushEnabled={profile.push_enabled}
          initialEmailEnabled={profile.email_enabled}
        />
      </Card>

      <Card className="mb-6">
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Push on this device
        </h2>
        <p className="mb-3 text-sm text-muted">
          Turning on push notifications above only controls whether you
          receive them. You also need to enable push for each device/browser
          you want to be notified on.
        </p>
        <PushSubscribeButton />
      </Card>

      {profile.role === "admin" && (
        <Link
          href="/settings/family"
          className="text-sm font-medium text-foreground underline"
        >
          Manage family invites &amp; prizes
        </Link>
      )}
    </div>
  );
}
