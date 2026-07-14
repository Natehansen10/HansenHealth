"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CreateInviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setInviteUrl(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("family_id")
      .eq("id", user?.id ?? "")
      .single();

    const { data, error } = await supabase
      .from("family_invites")
      .insert({
        family_id: profile?.family_id,
        email,
        invited_by: user?.id,
      })
      .select("token")
      .single();

    if (error || !data) {
      setStatus("error");
      setErrorMessage(error?.message ?? "Could not create invite.");
      return;
    }

    setStatus("idle");
    setEmail("");
    setInviteUrl(`${window.location.origin}/invite/${data.token}`);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">
        Invite a family member
      </h2>
      <label htmlFor="email" className="mb-1 block text-sm text-zinc-600">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 focus:border-zinc-500 focus:outline-none"
        placeholder="them@example.com"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {status === "saving" ? "Sending..." : "Create invite"}
      </button>

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}

      {inviteUrl && (
        <div className="mt-4 rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
          <p className="mb-1">Invite link (send this manually for now):</p>
          <code className="break-all">{inviteUrl}</code>
        </div>
      )}
    </form>
  );
}
