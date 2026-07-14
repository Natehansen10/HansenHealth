"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

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
      <p className="text-center text-zinc-700">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6"
    >
      <h1 className="mb-4 text-xl font-semibold text-zinc-900">
        Family Health Tracker
      </h1>
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
        placeholder="you@example.com"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {status === "sending" ? "Sending..." : "Send magic link"}
      </button>
      {status === "error" && (
        <p className="mt-3 text-sm text-red-600">
          Something went wrong. Try again.
        </p>
      )}
    </form>
  );
}
