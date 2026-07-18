"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { triggerTargetSnapshot } from "@/lib/actions/goals";
import { BlueprintCorners } from "@/components/ui/blueprint-corners";
import { Button } from "@/components/ui/button";

type Template = {
  id: string;
  title: string;
  category: string;
  default_frequency_per_week: number;
};

const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7];
const CUSTOM_VALUE = "__custom__";

export function NewGoalForm({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [selectedTemplateId, setSelectedTemplateId] = useState(CUSTOM_VALUE);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [frequency, setFrequency] = useState(3);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId);

    if (templateId === CUSTOM_VALUE) {
      setTitle("");
      setCategory("");
      setFrequency(3);
      return;
    }

    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setTitle(template.title);
      setCategory(template.category);
      setFrequency(template.default_frequency_per_week);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setStatus("error");
      setErrorMessage("Your session expired. Please sign in again.");
      return;
    }

    const { error } = await supabase.from("goals").insert({
      user_id: user.id,
      title,
      category: category || null,
      frequency_per_week: frequency,
      source: selectedTemplateId === CUSTOM_VALUE ? "custom" : "template",
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    // Best-effort recalculation -- don't block navigation on it. The Edge
    // Function call has no timeout, and a slow/cold-starting invocation
    // would otherwise leave the user stuck on "Creating..." even though
    // the goal row above was already inserted successfully. The cron-
    // scheduled snapshot will pick up any goal this call misses.
    triggerTargetSnapshot();

    router.push("/goals");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="blueprint w-full max-w-sm border border-divider bg-transparent p-6"
    >
      <BlueprintCorners />
      <label htmlFor="template" className="mb-1 block text-sm text-muted">
        Start from a template
      </label>
      <select
        id="template"
        value={selectedTemplateId}
        onChange={(e) => handleTemplateChange(e.target.value)}
        className="input mb-4 w-full"
      >
        <option value={CUSTOM_VALUE}>Custom goal</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.title}
          </option>
        ))}
      </select>

      <label htmlFor="title" className="mb-1 block text-sm text-muted">
        Title
      </label>
      <input
        id="title"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input mb-4 w-full"
        placeholder="Run"
      />

      <label htmlFor="category" className="mb-1 block text-sm text-muted">
        Category (optional)
      </label>
      <input
        id="category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="input mb-4 w-full"
        placeholder="cardio"
      />

      <label htmlFor="frequency" className="mb-1 block text-sm text-muted">
        Times per week
      </label>
      <select
        id="frequency"
        value={frequency}
        onChange={(e) => setFrequency(Number(e.target.value))}
        className="input mb-1 w-full"
      >
        {FREQUENCIES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <p className="mb-4 text-xs text-muted">Applies starting this month.</p>

      <Button type="submit" disabled={status === "saving"} className="w-full">
        {status === "saving" ? "Creating..." : "Create goal"}
      </Button>

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}
    </form>
  );
}
