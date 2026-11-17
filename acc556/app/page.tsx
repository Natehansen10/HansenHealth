import Link from "next/link";
import { awardPrize } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import {
  Card,
  EmptyState,
  PillNav,
  ProgressBar,
  SectionTitle,
  secondaryButtonClass,
} from "@/components/ui";
import { formatMonth, formatShortMonth, pct } from "@/lib/format";
import {
  LEADERBOARD_SQL_TEXT,
  getFamilies,
  getGoalBreakdown,
  getLeaderboard,
  getMonths,
  getPrizeStatus,
} from "@/lib/queries";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string; month?: string }>;
}) {
  const params = await searchParams;
  const [families, months] = await Promise.all([getFamilies(), getMonths()]);

  if (families.length === 0 || months.length === 0) {
    return (
      <EmptyState
        title="No data yet"
        description="Run sql/01_schema_and_data.sql in the Supabase SQL Editor to load the families, goals, and check-ins."
      />
    );
  }

  const family = families.find((f) => f.id === params.family) ?? families[0];
  const month = months.includes(params.month ?? "") ? params.month! : months[0];
  const href = (f: string, m: string) => `/?family=${f}&month=${m}`;

  const [rows, breakdown, prize] = await Promise.all([
    getLeaderboard(family.id, month),
    getGoalBreakdown(family.id, month),
    getPrizeStatus(family.id, month),
  ]);

  const ranked = rows.filter((r) => r.place !== null);
  const unranked = rows.filter((r) => r.place === null);
  const winners = rows.filter((r) => r.won).map((r) => r.full_name);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Monthly leaderboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Each member&apos;s check-ins against their monthly target. The highest
          completion rate in each family wins the month&apos;s prize. Ties share it.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <PillNav
          label="Family"
          items={families.map((f) => ({
            href: href(f.id, month),
            label: f.name,
            active: f.id === family.id,
          }))}
        />
        <PillNav
          label="Month"
          items={months.map((m) => ({
            href: href(family.id, m),
            label: formatShortMonth(m),
            active: m === month,
          }))}
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {family.name} · {formatMonth(month)}
            </h2>
            <p className="text-sm text-muted">
              {prize.awarded_at
                ? `Prize awarded ${prize.awarded_at} to ${winners.join(" and ") || "no one"}.`
                : prize.month_has_ended
                  ? "This month is over and the prize hasn't been awarded yet."
                  : "Month in progress. The prize is awarded after it ends."}
            </p>
          </div>
          {!prize.awarded_at && prize.month_has_ended && ranked.length > 0 && (
            <ActionButton
              action={awardPrize.bind(null, family.id, month)}
              label={`Award ${formatShortMonth(month)} prize`}
              pendingLabel="Awarding…"
              confirm={`Award the ${formatMonth(month)} prize for ${family.name}? This closes the month: its check-ins can no longer change.`}
              primary
            />
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No members in this family"
            description="Members join a family through an invite in the full app."
          />
        ) : ranked.length === 0 ? (
          <EmptyState
            title={`No goals tracked in ${formatMonth(month)}`}
            description="Nobody in this family had a target this month. Pick another month, or add a goal on a member's page."
            action={
              <Link href={`/members/${rows[0].id}`} className={secondaryButtonClass}>
                Open {rows[0].full_name}
              </Link>
            }
          />
        ) : (
          <ol className="flex flex-col divide-y divide-divider">
            {ranked.map((r) => {
              const goals = breakdown.filter((b) => b.user_id === r.id);
              return (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        r.place === 1
                          ? "bg-success-100 text-success-700"
                          : "bg-neutral-100 text-muted"
                      }`}
                      aria-label={`Place ${r.place}`}
                    >
                      {r.place}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <Link
                          href={`/members/${r.id}?month=${month}`}
                          className="font-medium hover:underline"
                        >
                          {r.full_name}
                          {r.won && (
                            <span className="ml-2 rounded-full bg-success-500 px-2 py-0.5 text-xs font-semibold text-white">
                              Prize winner
                            </span>
                          )}
                        </Link>
                        <span className="text-sm tabular-nums">
                          <span className="font-semibold">{pct(r.pct)}</span>
                          <span className="text-muted">
                            {" "}
                            · {r.checkins} of {r.target}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <ProgressBar value={r.pct} />
                      </div>
                      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                        {goals.map((g) => (
                          <li key={g.title}>
                            {g.title}: {g.checkins}/{g.target}{" "}
                            <span className="opacity-75">
                              ({g.frequency_per_week}×/wk)
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {unranked.length > 0 && ranked.length > 0 && (
          <p className="mt-4 border-t border-divider pt-3 text-sm text-muted">
            No goals tracked this month:{" "}
            {unranked.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ", "}
                <Link href={`/members/${r.id}`} className="underline">
                  {r.full_name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle>How this is calculated</SectionTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            Monthly target = times per week × days in the month ÷ 7, rounded.
            The view <code>v_goal_monthly_targets</code>{" "}
            calculates it from each goal&apos;s start and end dates.
          </li>
          <li>
            Completion = check-ins that month ÷ target, added up across all of
            a member&apos;s goals. A goal with zero check-ins still counts.
          </li>
          <li>
            Place uses <code>RANK()</code>, so tied members share a place and
            share the prize.
          </li>
        </ul>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-accent-700">
            Show the SQL
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-xs leading-relaxed text-neutral-100">
            {LEADERBOARD_SQL_TEXT}
          </pre>
        </details>
      </Card>
    </div>
  );
}
