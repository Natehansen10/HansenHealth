import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoalCard } from "@/components/goals/goal-card";
import { Button } from "@/components/ui/button";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { EmptyState } from "@/components/ui/empty-state";

export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: goals }, { data: profile }] = await Promise.all([
    supabase
      .from("goals")
      .select("id, title, category, unit, frequency_per_week, is_active")
      .eq("user_id", user.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .single(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      {!profile?.onboarded_at && <OnboardingFlow />}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
          My Goals
        </h1>
        <Link href="/goals/new">
          <Button type="button">New goal</Button>
        </Link>
      </div>

      {!goals || goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Goals are the family side of the app — set one, check in through the week, and everyone sees your progress."
          action={
            <Link href="/goals/new">
              <Button type="button">Create your first goal</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </div>
  );
}
