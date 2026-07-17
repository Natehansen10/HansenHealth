"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BlueprintCorners } from "@/components/ui/blueprint-corners";
import { Button } from "@/components/ui/button";

const DEFAULT_TIMEZONE = "America/Denver";

const TIMEZONES = Intl.supportedValuesOf
  ? Intl.supportedValuesOf("timeZone")
  : [DEFAULT_TIMEZONE];

export function CreateFamilyForm() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");

    const supabase = createClient();
    const { error } = await supabase.rpc("create_family", {
      family_name: familyName,
      new_full_name: fullName,
      new_timezone: timezone,
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="blueprint w-full max-w-sm border border-divider bg-transparent p-6"
    >
      <BlueprintCorners />
      <h1 className="mb-4 text-xl font-semibold text-foreground">
        Create your family
      </h1>

      <label htmlFor="fullName" className="mb-1 block text-sm text-muted">
        Your name
      </label>
      <input
        id="fullName"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="input mb-4 w-full"
        placeholder="Jamie Smith"
      />

      <label htmlFor="familyName" className="mb-1 block text-sm text-muted">
        Family name
      </label>
      <input
        id="familyName"
        required
        value={familyName}
        onChange={(e) => setFamilyName(e.target.value)}
        className="input mb-4 w-full"
        placeholder="The Smith Family"
      />

      <label htmlFor="timezone" className="mb-1 block text-sm text-muted">
        Timezone
      </label>
      <select
        id="timezone"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className="input mb-4 w-full"
      >
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>

      <Button type="submit" disabled={status === "saving"} className="w-full">
        {status === "saving" ? "Creating..." : "Create family"}
      </Button>

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}
    </form>
  );
}
