import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createGoal,
  deleteCheckin,
  logCheckin,
  toggleGoal,
} from "@/app/actions";
import { ActionButton, CheckinForm, GoalForm } from "@/components/forms";
import {
  Card,
  EmptyState,
  PillNav,
  ProgressBar,
  SectionTitle,
} from "@/components/ui";
import { formatDay, formatMonth, formatShortMonth } from "@/lib/format";
import {
  getMember,
  getMemberCheckins,
  getMemberGoals,
  getMemberPrizeMonths,
  getMonths,
} from "@/lib/queries";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [member, months] = await Promise.all([getMember(id), getMonths()]);
  if (!member) notFound();

  const requested = (await searchParams).month ?? "";
  const thisMonth = `${member.today.slice(0, 7)}-01`;
  const monthOptions = months.includes(thisMonth) ? months : [thisMonth, ...months];
  const month = monthOptions.includes(requested) ? requested : monthOptions[0];

  const [goals, checkins, prizeMonths] = await Promise.all([
    getMemberGoals(id, month),
    getMemberCheckins(id),
    getMemberPrizeMonths(id),
  ]);
  const activeGoals = goals.filter((g) => g.is_active);
  const tracked = goals.filter((g) => g.month_target !== null);
  const monthTarget = tracked.reduce((s, g) => s + (g.month_target ?? 0), 0);
  const monthDone = tracked.reduce((s, g) => s + g.month_checkins, 0);
  const monthPct = monthTarget > 0 ? (100 * monthDone) / monthTarget : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/members" className="text-sm text-accent-700 hover:underline">
          ← All members
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {member.full_name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {member.family_id ? (
            <Link
              href={`/?family=${member.family_id}&month=${month}`}
              className="underline"
            >
              {member.family_name}
            </Link>
          ) : (
            "Not in a family yet, so not on a leaderboard"
          )}
          {" · "}
          {member.role === "admin" ? "Family admin" : "Member"} ·{" "}
          {member.timezone.replace("_", " ")}
          {prizeMonths.length > 0 &&
            ` · Won ${prizeMonths.map(formatShortMonth).join(", ")}`}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <SectionTitle hint={`Today is ${formatDay(member.today)}`}>
            Log a check-in
          </SectionTitle>
          {activeGoals.length === 0 ? (
            <EmptyState
              title="No active goals"
              description="Add a goal below, then check in here."
            />
          ) : (
            <CheckinForm
              action={logCheckin.bind(null, member.id)}
              goals={activeGoals.map((g) => ({ id: g.id, title: g.title }))}
              today={member.today}
            />
          )}
        </Card>

        <Card>
          <SectionTitle hint={monthPct !== null ? `${monthPct.toFixed(1)}% overall` : undefined}>
            Goals in {formatMonth(month)}
          </SectionTitle>
          <div className="mb-3">
            <PillNav
              label="Month"
              items={monthOptions.map((m) => ({
                href: `/members/${member.id}?month=${m}`,
                label: formatShortMonth(m),
                active: m === month,
              }))}
            />
          </div>
          {goals.length === 0 ? (
            <EmptyState
              title="No goals yet"
              description="Add one with the form at the bottom of this page."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-divider">
              {goals.map((g) => {
                const p =
                  g.month_target && g.month_target > 0
                    ? (100 * g.month_checkins) / g.month_target
                    : null;
                return (
                  <li key={g.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {g.title}
                          {!g.is_active && (
                            <span className="ml-2 rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-muted">
                              Paused
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {g.category ?? "No category"} · now {g.frequency_per_week}×/week
                          {g.unit && ` · ${g.unit}`} · since {formatDay(g.start_date)}
                        </p>
                      </div>
                      <ActionButton
                        action={toggleGoal.bind(null, member.id, g.id)}
                        label={g.is_active ? "Pause" : "Resume"}
                        pendingLabel="Saving…"
                      />
                    </div>
                    {g.month_target === null ? (
                      <p className="text-xs text-muted">
                        Not tracked in {formatMonth(month)}.
                      </p>
                    ) : (
                      <>
                        <ProgressBar value={p} />
                        <p className="text-xs text-muted tabular-nums">
                          {g.month_checkins} of {g.month_target} (
                          {g.month_frequency}×/week that month)
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <SectionTitle hint="Most recent 30">Check-in history</SectionTitle>
        {checkins.length === 0 ? (
          <EmptyState
            title="No check-ins yet"
            description="Log the first one with the form above."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-divider">
            {checkins.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{formatDay(c.checkin_date)}</span>
                    <span className="text-muted"> · {c.goal_title}</span>
                    {c.duration_minutes !== null && (
                      <span className="text-muted"> · {c.duration_minutes} min</span>
                    )}
                  </p>
                  {c.note && <p className="truncate text-xs text-muted">{c.note}</p>}
                </div>
                {c.locked ? (
                  <span className="shrink-0 text-xs text-muted" title="This month's prize has been awarded">
                    Closed
                  </span>
                ) : (
                  <ActionButton
                    action={deleteCheckin.bind(null, member.id, c.id)}
                    label="Delete"
                    pendingLabel="Deleting…"
                    confirm="Delete this check-in?"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle hint="Counts from this month, with a full-month target">
          Add a goal
        </SectionTitle>
        <GoalForm action={createGoal.bind(null, member.id)} />
      </Card>
    </div>
  );
}
