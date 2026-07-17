import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateFamilyForm } from "@/components/auth/create-family-form";

export default async function CreateFamilyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <CreateFamilyForm />
    </div>
  );
}
