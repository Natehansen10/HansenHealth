"use client";

import { useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type LogSection = {
  id: string;
  label: string;
  heading: string;
  description?: string;
  content: ReactNode;
};

// Tab shell for /log. `content` arrives already rendered from the server
// page, so switching tabs is instant (no fetch, no spinner) at the cost of
// sending all sections in the initial payload -- the right trade for a page
// whose entire purpose is logging several different things quickly.
//
// initialSection comes from the ?section= search param, read server-side.
// That keeps "Log your weight" deep-linkable from elsewhere in the app
// without seeding state from anything browser-only.
export function LogTabs({
  sections,
  initialSection,
}: {
  sections: LogSection[];
  initialSection: string;
}) {
  const [active, setActive] = useState(
    sections.some((s) => s.id === initialSection)
      ? initialSection
      : sections[0].id,
  );

  const current = sections.find((s) => s.id === active) ?? sections[0];

  return (
    <div>
      <SegmentedControl
        label="What do you want to log?"
        value={active}
        onChange={setActive}
        options={sections.map((s) => ({ value: s.id, label: s.label }))}
        className="mb-6"
      />

      <section aria-labelledby="log-section-heading">
        <h2
          id="log-section-heading"
          className="mb-1 text-lg font-semibold text-foreground"
        >
          {current.heading}
        </h2>
        {current.description && (
          <p className="mb-4 text-sm text-muted">{current.description}</p>
        )}
        <div className={current.description ? "" : "mt-4"}>
          {current.content}
        </div>
      </section>
    </div>
  );
}
