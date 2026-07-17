"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BlueprintCorners } from "@/components/ui/blueprint-corners";
import { Button } from "@/components/ui/button";

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

    if (!user) {
      setStatus("error");
      setErrorMessage("Your session expired. Please sign in again.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("family_id")
      .eq("id", user.id)
      .single();

    if (!profile?.family_id) {
      setStatus("error");
      setErrorMessage("Could not determine your family. Try refreshing.");
      return;
    }

    const { data, error } = await supabase
      .from("family_invites")
      .insert({
        family_id: profile.family_id,
        email,
        invited_by: user.id,
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
      className="blueprint mb-6 border border-divider bg-transparent p-6"
    >
      <BlueprintCorners />
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Invite a family member
      </h2>
      <label htmlFor="email" className="mb-1 block text-sm text-muted">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input mb-4 w-full"
        placeholder="them@example.com"
      />
      <Button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Sending..." : "Create invite"}
      </Button>

      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
      )}

      {inviteUrl && (
        <div className="mt-4 border border-divider bg-surface p-3 text-sm text-foreground">
          <p className="mb-1">Invite link (send this manually for now):</p>
          <code className="break-all">{inviteUrl}</code>
        </div>
      )}
    </form>
  );
}
