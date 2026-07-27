"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BlueprintCorners } from "@/components/ui/blueprint-corners";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const callbackError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p className="text-center text-foreground">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="blueprint w-full max-w-sm border border-divider bg-transparent p-6"
    >
      <BlueprintCorners />
      <h1 className="mb-4 text-xl font-semibold text-foreground">
        Family Health Tracker
      </h1>
      {callbackError && (
        <p className="mb-4 text-sm text-red-600">
          {callbackError === "link_expired"
            ? "That sign-in link has expired or was already used. Request a new one below."
            : "We couldn't sign you in. Request a new link below."}
        </p>
      )}
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
        placeholder="you@example.com"
      />
      <Button
        type="submit"
        disabled={status === "sending"}
        className="w-full"
      >
        {status === "sending" ? "Sending..." : "Send magic link"}
      </Button>
      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">
          Something went wrong. Try again.
        </p>
      )}
    </form>
  );
}
