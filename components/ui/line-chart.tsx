// Hand-rolled SVG line chart. No charting library: the only runtime deps
// this project has are next/react/@supabase, and the entire requirement
// here is "draw a polyline through <= a few hundred dated points". Recharts
// (~90kb) or Chart.js (~70kb) to do that would be most of the app's JS
// budget spent on five small trend cards.
//
// Both components below are Server Components -- they render to static SVG
// markup and ship zero JavaScript.
//
// RESPONSIVENESS NOTE, this is the load-bearing detail: the <svg> uses
// preserveAspectRatio="none" so the plot stretches to whatever width the
// container is, at a fixed pixel height. That non-uniform scale would
// distort anything with intrinsic proportions, so:
//   - every stroked path carries vector-effect="non-scaling-stroke", which
//     keeps line weight at its authored width no matter the x-scale;
//   - there is no <text>, no <circle>, and no marker anywhere inside the
//     SVG. Every label is HTML rendered around the chart instead.
// Adding a <text> or <circle> here will look correct at one width and
// visibly wrong at another -- put it in the surrounding HTML instead.

export type ChartPoint = { date: string; value: number };

export type ChartSeries = {
  id: string;
  label: string;
  // Any CSS color; call sites pass design-system custom properties, e.g.
  // "var(--color-accent-900)".
  color: string;
  points: ChartPoint[];
};

// Days since the Unix epoch for a YYYY-MM-DD string. Pure calendar math on
// the parsed Y/M/D -- deliberately not `new Date(str)`, which would apply a
// timezone offset and can shift a date across a day boundary. Matches the
// approach in lib/utils/dates.ts: date strings are compared as dates, never
// as instants.
function dayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

// Authored viewBox width. Arbitrary -- the SVG scales to its container --
// but a large-ish number keeps the path `d` coordinates readable and avoids
// rounding artifacts at small widths.
const VIEW_W = 600;

type Domain = { xMin: number; xSpan: number; yMin: number; ySpan: number };

function computeDomain(series: ChartSeries[]): Domain | null {
  const points = series.flatMap((s) => s.points);
  if (points.length === 0) return null;

  const xs = points.map((p) => dayIndex(p.date));
  const ys = points.map((p) => p.value);

  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);

  // A flat series (every value identical, or a single point) has no span to
  // scale against. Give it a symmetric band so it renders as a centered
  // horizontal line instead of dividing by zero or pinning to an edge.
  if (yMax === yMin) {
    const pad = Math.abs(yMax) * 0.1 || 1;
    yMin -= pad;
    yMax += pad;
  } else {
    // Breathing room so the extremes don't sit exactly on the frame.
    const pad = (yMax - yMin) * 0.12;
    yMin -= pad;
    yMax += pad;
  }

  return {
    xMin,
    // xSpan 0 means every point shares one date; the projection below
    // centers them rather than dividing by zero.
    xSpan: xMax - xMin,
    yMin,
    ySpan: yMax - yMin,
  };
}

function project(point: ChartPoint, domain: Domain, height: number) {
  const x =
    domain.xSpan === 0
      ? VIEW_W / 2
      : ((dayIndex(point.date) - domain.xMin) / domain.xSpan) * VIEW_W;
  // SVG y grows downward; invert so larger values sit higher.
  const y =
    height - ((point.value - domain.yMin) / domain.ySpan) * height;
  return { x, y };
}

function toLinePath(
  points: ChartPoint[],
  domain: Domain,
  height: number,
): string {
  return points
    .map((p, i) => {
      const { x, y } = project(p, domain, height);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function toAreaPath(
  points: ChartPoint[],
  domain: Domain,
  height: number,
): string {
  const first = project(points[0], domain, height);
  const last = project(points[points.length - 1], domain, height);
  return `M${first.x.toFixed(2)} ${height} ${toLinePath(points, domain, height).slice(1)} L${last.x.toFixed(2)} ${height} Z`;
}

// Points must be sorted by date for the path to trace forward in time; the
// data helpers already return them ascending, but a chart that silently
// zig-zags on unsorted input is a nasty bug to chase, so sort defensively.
function sorted(points: ChartPoint[]): ChartPoint[] {
  return [...points].sort((a, b) => dayIndex(a.date) - dayIndex(b.date));
}

export function LineChart({
  series,
  height = 120,
  fill = true,
  ariaLabel,
}: {
  series: ChartSeries[];
  height?: number;
  // Area fill under the line. Off by default for multi-series charts (two
  // translucent fills over each other read as a third, meaningless color).
  fill?: boolean;
  ariaLabel: string;
}) {
  const domain = computeDomain(series);
  if (!domain) return null;

  const drawable = series
    .map((s) => ({ ...s, points: sorted(s.points) }))
    .filter((s) => s.points.length > 0);
  const fillEnabled = fill && drawable.length === 1;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full"
    >
      {/* Horizontal gridlines only. Vertical ones would need date-aware
          spacing to mean anything, and the x-axis labels below the chart
          already carry that information. */}
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1="0"
          x2={VIEW_W}
          y1={height * t}
          y2={height * t}
          stroke="var(--color-divider)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {drawable.map((s) => {
        // A single point has no segment to stroke and would render as
        // nothing at all. Give it a full-width dashed rule at its value so
        // "one reading so far" still shows where that reading sits.
        const single = s.points.length === 1;
        const singleY = single
          ? project(s.points[0], domain, height).y.toFixed(2)
          : null;
        const d = single
          ? `M0 ${singleY} L${VIEW_W} ${singleY}`
          : toLinePath(s.points, domain, height);

        return (
          <g key={s.id}>
            {fillEnabled && !single && (
              <path
                d={toAreaPath(s.points, domain, height)}
                fill={s.color}
                opacity="0.12"
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              strokeDasharray={single ? "4 4" : undefined}
              opacity={single ? 0.7 : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}

// Compact inline variant for list rows: no gridlines, no fill, no frame.
export function Sparkline({
  points,
  color = "var(--color-accent-700)",
  height = 28,
  ariaLabel,
}: {
  points: ChartPoint[];
  color?: string;
  height?: number;
  ariaLabel: string;
}) {
  const series: ChartSeries[] = [{ id: "s", label: ariaLabel, color, points }];
  const domain = computeDomain(series);
  if (!domain || points.length < 2) return null;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full"
    >
      <path
        d={toLinePath(sorted(points), domain, height)}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
