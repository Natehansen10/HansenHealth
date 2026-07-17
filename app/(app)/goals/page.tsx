import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoalCard } from "@/components/goals/goal-card";
import { Button } from "@/components/ui/button";

export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, category, frequency_per_week, is_active")
    .eq("user_id", user.id)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">My Goals</h1>
        <Link href="/goals/new">
          <Button type="button">New goal</Button>
        </Link>
      </div>

      {!goals || goals.length === 0 ? (
        <p className="text-muted">
          No goals yet.{" "}
          <Link href="/goals/new" className="text-foreground underline">
            Create your first goal
          </Link>
          .
        </p>
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
