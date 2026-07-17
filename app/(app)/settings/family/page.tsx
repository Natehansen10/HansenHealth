import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateInviteForm } from "@/components/family/create-invite-form";
import { PendingInvitesList } from "@/components/family/pending-invites-list";

export default async function FamilySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, family_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin" || !profile.family_id) {
    redirect("/settings");
  }

  const { data: invites } = await supabase
    .from("family_invites")
    .select("id, email, status, expires_at")
    .eq("family_id", profile.family_id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">
        Family settings
      </h1>
      <CreateInviteForm />
      <h2 className="mb-3 text-lg font-semibold text-foreground">Invites</h2>
      <PendingInvitesList invites={invites ?? []} />
    </div>
  );
}
