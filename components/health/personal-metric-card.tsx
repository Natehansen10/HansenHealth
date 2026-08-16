import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/line-chart";
import { formatShortDate, type MetricPoint } from "@/lib/utils/health";

// A user-defined metric's card on /health. Uses the compact Sparkline
// rather than the full LineChart: these sit in a list below the built-in
// trend grid, and a full-height chart per custom metric would bury the page
// for anyone tracking more than two or three.
export function PersonalMetricCard({
  name,
  unit,
  targetValue,
  frequency,
  points,
}: {
  name: string;
  unit: string | null;
  targetValue: number | null;
  frequency: string;
  points: MetricPoint[];
}) {
  const latest = points[points.length - 1] ?? null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-medium text-foreground">{name}</h3>
        <span className="font-heading text-lg font-semibold text-foreground">
          {latest
            ? `${Number(latest.value.toFixed(2))}${unit ? ` ${unit}` : ""}`
            : "--"}
        </span>
      </div>

      <p className="text-xs text-muted">
        {targetValue !== null
          ? `Target ${targetValue}${unit ? ` ${unit}` : ""} · ${frequency}`
          : frequency}
      </p>

      {points.length >= 2 ? (
        <>
          <div className="mt-3">
            <Sparkline points={points} ariaLabel={`${name} trend`} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>{formatShortDate(points[0].date)}</span>
            <span>{formatShortDate(latest!.date)}</span>
          </div>
        </>
      ) : (
        // One reading isn't a trend. Say so rather than drawing a
        // single-point "chart" that implies a direction it can't support.
        <p className="mt-3 text-xs text-muted">
          {points.length === 1
            ? `Logged once, on ${formatShortDate(points[0].date)}. Log again to see a trend.`
            : "No entries in this range yet."}
        </p>
      )}
    </Card>
  );
}
