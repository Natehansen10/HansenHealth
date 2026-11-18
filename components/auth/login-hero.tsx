import { BlueprintCorners } from "@/components/ui/blueprint-corners";

// Brand panel for /login. Server Component, zero JS. On phones it collapses
// to a compact header (mark, headline, one line) so the form stays above the
// fold; the preview card and feature list only render from lg: up.
//
// The "This month" card is illustrative, not live data -- nobody is signed
// in yet. It shows the core game rule (everyone at 100% wins) at a glance.

const PREVIEW_ROWS = [
  { name: "Dad", percent: 104 },
  { name: "Mom", percent: 92 },
  { name: "You", percent: 71 },
];

const FEATURES = [
  {
    title: "Shared goals",
    body: "Pick a weekly target. Your monthly target is set for you.",
  },
  {
    title: "Fast check-ins",
    body: "Log a workout in seconds and cheer on the rest of the family.",
  },
  {
    title: "Monthly prize",
    body: "Everyone who reaches 100% wins. No single winner.",
  },
  {
    title: "Private health log",
    body: "Weight, sleep, and vitals stay yours unless you choose to share.",
  },
];

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <rect x="8" y="10" width="14" height="80" />
      <rect x="43" y="10" width="14" height="80" />
      <rect x="78" y="10" width="14" height="80" />
      <rect x="8" y="43" width="49" height="14" />
      <rect x="43" y="43" width="49" height="14" />
    </svg>
  );
}

export function LoginHero() {
  return (
    <section className="grid-lines relative flex flex-col overflow-hidden bg-accent-900 px-6 py-8 text-background sm:px-10 lg:min-h-screen lg:px-14 lg:py-12">
      <div className="flex items-center gap-2.5">
        <LogoMark className="h-6 w-6 text-accent-300" />
        <span className="font-heading text-xl font-semibold tracking-wide">
          Hansen Health
        </span>
      </div>

      <div className="mt-8 max-w-lg lg:mt-auto">
        <p className="font-heading text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">
          Family fitness, tracked together
        </p>
        <h1 className="mt-3 font-heading text-4xl leading-[1.05] font-semibold uppercase sm:text-5xl lg:text-6xl">
          Move more.
          <br />
          <span className="text-accent-300">Together.</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-accent-200">
          Set monthly exercise goals, check in when you work out, and see how
          the whole family is doing in one place.
        </p>
      </div>

      <div
        aria-hidden="true"
        className="blueprint blueprint-inverse mt-10 hidden max-w-md border border-white/15 bg-white/5 p-5 backdrop-blur-[1px] lg:block"
      >
        <BlueprintCorners />
        <div className="mb-4 flex items-baseline justify-between">
          <span className="font-heading text-sm font-semibold uppercase tracking-[0.15em]">
            This month
          </span>
          <span className="text-xs text-accent-300">Family progress</span>
        </div>
        <ul className="space-y-3">
          {PREVIEW_ROWS.map((row) => {
            const won = row.percent >= 100;
            return (
              <li key={row.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {row.name}
                    {won && (
                      <span className="border border-accent-300/60 px-1.5 py-px font-heading text-[10px] font-semibold uppercase tracking-wider text-accent-200">
                        Prize
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-accent-200">
                    {row.percent}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/10">
                  <div
                    className={`h-full ${won ? "bg-accent-200" : "bg-accent-400"}`}
                    style={{ width: `${Math.min(100, row.percent)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="mt-10 hidden max-w-2xl grid-cols-2 gap-x-8 gap-y-6 border-t border-white/15 pt-8 lg:mb-auto lg:grid">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-1.5 h-2 w-2 flex-shrink-0 bg-accent-300"
            />
            <div>
              <h3 className="font-heading text-base font-semibold tracking-wide">
                {feature.title}
              </h3>
              <p className="mt-0.5 text-sm text-accent-300">{feature.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
