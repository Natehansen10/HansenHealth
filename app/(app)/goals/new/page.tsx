import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewGoalForm } from "@/components/goals/new-goal-form";

export default async function NewGoalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: templates } = await supabase
    .from("goal_templates")
    .select("id, title, category, default_frequency_per_week")
    .order("title");

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-8">
      <NewGoalForm templates={templates ?? []} />
    </div>
  );
}
