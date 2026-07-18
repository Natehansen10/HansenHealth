import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateInviteForm } from "@/components/family/create-invite-form";
import { PendingInvitesList } from "@/components/family/pending-invites-list";
import { FamilyPrizesForm } from "@/components/family/family-prizes-form";

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

  const [{ data: invites }, { data: prizes }] = await Promise.all([
    supabase
      .from("family_invites")
      .select("id, email, status, expires_at")
      .eq("family_id", profile.family_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("family_prizes")
      .select("individual_prize_description, group_prize_description")
      .eq("family_id", profile.family_id)
      .maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-foreground">
        Family settings
      </h1>
      <FamilyPrizesForm
        initialIndividualPrize={prizes?.individual_prize_description ?? ""}
        initialGroupPrize={prizes?.group_prize_description ?? ""}
      />
      <CreateInviteForm />
      <h2 className="mb-3 text-lg font-semibold text-foreground">Invites</h2>
      <PendingInvitesList invites={invites ?? []} />
    </div>
  );
}
