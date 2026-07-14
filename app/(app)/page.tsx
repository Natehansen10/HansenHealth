import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, family_id")
    .eq("id", user.id)
    .single();

  const { data: family } = await supabase
    .from("families")
    .select("name")
    .eq("id", profile?.family_id ?? "")
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">
        {family?.name ?? "Your family"}
      </h1>
      <p className="text-zinc-600">
        Welcome, {profile?.full_name}. No goals or check-ins yet.
      </p>
    </div>
  );
}
