"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TIMEZONES = Intl.supportedValuesOf
  ? Intl.supportedValuesOf("timeZone")
  : ["America/Denver"];

export function CreateFamilyForm() {
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver",
  );
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
      className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6"
    >
      <h1 className="mb-4 text-xl font-semibold text-zinc-900">
        Create your family
      </h1>

      <label htmlFor="fullName" className="mb-1 block text-sm text-zinc-600">
        Your name
      </label>
      <input
        id="fullName"
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none"
        placeholder="Jamie Smith"
      />

      <label
        htmlFor="familyName"
        className="mb-1 block text-sm text-zinc-600"
      >
        Family name
      </label>
      <input
        id="familyName"
        required
        value={familyName}
        onChange={(e) => setFamilyName(e.target.value)}
        className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none"
        placeholder="The Smith Family"
      />

      <label htmlFor="timezone" className="mb-1 block text-sm text-zinc-600">
        Timezone
      </label>
      <select
        id="timezone"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none"
      >
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={status === "saving"}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {status === "saving" ? "Creating..." : "Create family"}
      </button>

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}
    </form>
  );
}
