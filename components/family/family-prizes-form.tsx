"use client";

import { useState, useTransition } from "react";
import { setFamilyPrizes } from "@/lib/actions/family-prizes";
import { BlueprintCorners } from "@/components/ui/blueprint-corners";
import { Button } from "@/components/ui/button";

export function FamilyPrizesForm({
  initialIndividualPrize,
  initialGroupPrize,
}: {
  initialIndividualPrize: string;
  initialGroupPrize: string;
}) {
  const [individualPrize, setIndividualPrize] = useState(initialIndividualPrize);
  const [groupPrize, setGroupPrize] = useState(initialGroupPrize);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");

    startTransition(async () => {
      const { error } = await setFamilyPrizes({
        individual_prize_description: individualPrize,
        group_prize_description: groupPrize,
      });

      if (error) {
        setStatus("error");
        setErrorMessage(error);
        return;
      }

      setStatus("saved");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="blueprint mb-6 border border-divider bg-transparent p-6"
    >
      <BlueprintCorners />
      <h2 className="mb-4 text-lg font-semibold text-foreground">Prizes</h2>

      <label htmlFor="individualPrize" className="mb-1 block text-sm text-muted">
        Individual prize
      </label>
      <input
        id="individualPrize"
        value={individualPrize}
        onChange={(e) => setIndividualPrize(e.target.value)}
        className="input mb-4 w-full"
        placeholder="e.g. Pick a movie night"
      />

      <label htmlFor="groupPrize" className="mb-1 block text-sm text-muted">
        Group prize (unlocks if everyone hits 100%)
      </label>
      <input
        id="groupPrize"
        value={groupPrize}
        onChange={(e) => setGroupPrize(e.target.value)}
        className="input mb-4 w-full"
        placeholder="e.g. Dinner party"
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save prizes"}
      </Button>

      {status === "saved" && (
        <p className="mt-3 text-sm text-muted">Saved.</p>
      )}
      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}
    </form>
  );
}
