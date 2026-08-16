import { Card } from "@/components/ui/card";
import { LineChart, type ChartSeries } from "@/components/ui/line-chart";
import {
  formatMetricValue,
  formatShortDate,
  trendDelta,
  type HealthMetricDef,
  type MetricPoint,
} from "@/lib/utils/health";

// Server Components -- these render to static SVG + text and ship no JS.

// Shared frame: title, headline reading, delta, plot, date range footer.
// Kept separate from the metric-specific wrappers below so the blood
// pressure card (two series, a paired headline) gets the same shell without
// pretending to be a single metric.
function TrendFrame({
  title,
  headline,
  delta,
  series,
  firstDate,
  lastDate,
  ariaLabel,
  legend,
}: {
  title: string;
  headline: string;
  delta?: { text: string; tone: "good" | "bad" | "neutral" } | null;
  series: ChartSeries[];
  firstDate: string;
  lastDate: string;
  ariaLabel: string;
  legend?: { label: string; color: string }[];
}) {
  const deltaClass =
    delta?.tone === "good"
      ? "text-success-500"
      : delta?.tone === "bad"
        ? "text-red-600"
        : "text-muted";

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold text-muted uppercase">
          {title}
        </h3>
        {delta && (
          <span className={`text-xs font-medium ${deltaClass}`}>
            {delta.text}
          </span>
        )}
      </div>

      <p className="mt-1 font-heading text-2xl font-semibold text-foreground">
        {headline}
      </p>

      <div className="mt-3">
        <LineChart series={series} ariaLabel={ariaLabel} height={96} />
      </div>

      {/* Axis labels live in HTML, not inside the SVG -- the chart scales
          non-uniformly and would stretch any <text> it contained. */}
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{formatShortDate(firstDate)}</span>
        <span>{formatShortDate(lastDate)}</span>
      </div>

      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-3"
                style={{ background: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

// A single built-in metric (weight, steps, sleep, ...). Renders nothing when
// there are no readings -- the page decides whether an absent metric
// deserves an empty state or should simply be omitted, and most of the time
// omitting is right: a card reading "no data" for every metric you don't
// track is noise, not information.
export function MetricTrendCard({
  def,
  points,
  weightUnit,
}: {
  def: HealthMetricDef;
  points: MetricPoint[];
  weightUnit: string;
}) {
  if (points.length === 0) return null;

  const latest = points[points.length - 1];
  const delta = trendDelta(points);

  let deltaInfo: { text: string; tone: "good" | "bad" | "neutral" } | null =
    null;
  if (delta && delta.direction !== "flat") {
    const arrow = delta.direction === "up" ? "▲" : "▼";
    const magnitude = Math.abs(delta.change);
    const shown = def.decimal
      ? Number(magnitude.toFixed(2))
      : Math.round(magnitude);

    // lowerIsBetter === null means the metric has no inherent good
    // direction (weight and body fat depend entirely on what the person is
    // going for), so the delta is shown without a value judgement.
    const tone =
      def.lowerIsBetter === null
        ? "neutral"
        : (delta.direction === "down") === def.lowerIsBetter
          ? "good"
          : "bad";

    deltaInfo = {
      text: `${arrow} ${shown.toLocaleString("en-US")}`,
      tone,
    };
  }

  return (
    <TrendFrame
      title={def.label}
      headline={formatMetricValue(def, latest.value, weightUnit)}
      delta={deltaInfo}
      series={[
        {
          id: def.key,
          label: def.label,
          color: "var(--color-accent-900)",
          points,
        },
      ]}
      firstDate={points[0].date}
      lastDate={latest.date}
      ariaLabel={`${def.label} trend, ${points.length} readings, latest ${formatMetricValue(def, latest.value, weightUnit)}`}
    />
  );
}

// Blood pressure is two series on one axis on purpose: systolic and
// diastolic are only meaningful as a pair, and splitting them into separate
// cards makes the reader do the pairing themselves. Area fill is off (the
// LineChart disables it for multi-series anyway) -- two translucent fills
// overlapping would read as a third, meaningless band.
export function BloodPressureCard({
  systolic,
  diastolic,
}: {
  systolic: MetricPoint[];
  diastolic: MetricPoint[];
}) {
  if (systolic.length === 0 && diastolic.length === 0) return null;

  const allDates = [...systolic, ...diastolic].map((p) => p.date).sort();
  const latestSys = systolic[systolic.length - 1];
  const latestDia = diastolic[diastolic.length - 1];

  const headline =
    latestSys && latestDia
      ? `${Math.round(latestSys.value)}/${Math.round(latestDia.value)}`
      : latestSys
        ? `${Math.round(latestSys.value)}/--`
        : `--/${Math.round(latestDia.value)}`;

  const series: ChartSeries[] = [];
  if (systolic.length > 0) {
    series.push({
      id: "systolic",
      label: "Systolic",
      color: "var(--color-accent-900)",
      points: systolic,
    });
  }
  if (diastolic.length > 0) {
    series.push({
      id: "diastolic",
      label: "Diastolic",
      color: "var(--color-accent-500)",
      points: diastolic,
    });
  }

  return (
    <TrendFrame
      title="Blood pressure"
      headline={`${headline} mmHg`}
      series={series}
      firstDate={allDates[0]}
      lastDate={allDates[allDates.length - 1]}
      ariaLabel={`Blood pressure trend, latest ${headline} mmHg`}
      legend={[
        { label: "Systolic", color: "var(--color-accent-900)" },
        { label: "Diastolic", color: "var(--color-accent-500)" },
      ]}
    />
  );
}
