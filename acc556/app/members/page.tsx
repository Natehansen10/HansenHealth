import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { getMembers } from "@/lib/queries";

export default async function MembersPage() {
  const members = await getMembers();

  if (members.length === 0) {
    return (
      <EmptyState
        title="No members yet"
        description="Run sql/01_schema_and_data.sql in Supabase to load the sample families."
      />
    );
  }

  // Group by family; people without a family go last.
  const groups = new Map<string, typeof members>();
  for (const m of members) {
    const key = m.family_name ?? "No family yet";
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a person to log a check-in, add a goal, or see their history.
        </p>
      </div>

      {[...groups.entries()].map(([family, list]) => (
        <Card key={family}>
          <h2 className="mb-2 text-base font-semibold">{family}</h2>
          <ul className="divide-y divide-divider">
            {list.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/members/${m.id}`}
                  className="-mx-2 flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-2.5 hover:bg-neutral-100"
                >
                  <span className="font-medium">
                    {m.full_name}
                    {m.role === "admin" && (
                      <span className="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-xs text-accent-800">
                        Admin
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted tabular-nums">
                    {m.active_goals} active {m.active_goals === 1 ? "goal" : "goals"} ·{" "}
                    {m.total_checkins} check-ins
                    {m.prizes_won > 0 && ` · ${m.prizes_won} prize${m.prizes_won > 1 ? "s" : ""}`}
                    {m.last_checkin && ` · last ${formatDay(m.last_checkin)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
