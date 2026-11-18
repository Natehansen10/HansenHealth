"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BlueprintCorners } from "@/components/ui/blueprint-corners";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

// Shared frame for both states (form + "check your email") so the card
// doesn't change size when the link is sent. The Suspense fallback in
// app/(auth)/login/page.tsx mirrors these classes.
const CARD_CLASSES =
  "blueprint w-full max-w-sm border border-divider bg-neutral-100 p-8 shadow-md";

const CALLBACK_ERRORS: Record<string, string> = {
  link_expired:
    "That sign-in link has expired or was already used. Request a new one below.",
  no_session: "We couldn't finish signing you in. Request a new link below.",
  missing_code: "That link was incomplete. Request a new one below.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const callbackError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  // The address the link actually went to, captured at send time so the
  // confirmation can name it even if the input is later edited.
  const [sentTo, setSentTo] = useState("");

  async function sendLink(address: string) {
    setStatus("sending");

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: callbackUrl.toString() },
      });

      if (error) {
        setStatus("error");
        return;
      }

      setSentTo(address);
      setStatus("sent");
    } catch (err) {
      // Without this the button would sit on "Sending..." forever after a
      // network failure, with no way for the user to retry.
      console.error("Sending magic link failed", err);
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className={CARD_CLASSES}>
        <BlueprintCorners />
        <h2 className="mb-2 text-2xl text-foreground">Check your email</h2>
        <p className="mb-4 text-sm text-muted">
          We sent a sign-in link to{" "}
          <span className="text-foreground">{sentTo}</span>. Open it on this
          device to finish signing in.
        </p>
        <p className="mb-5 text-sm text-muted">
          Nothing after a minute? Check your spam or junk folder. The link
          sometimes lands there.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => sendLink(sentTo)}
          >
            Resend link
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => {
              setStatus("idle");
              setEmail(sentTo);
            }}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        sendLink(email);
      }}
      className={CARD_CLASSES}
    >
      <BlueprintCorners />
      <h2 className="mb-1 text-2xl text-foreground">Sign in</h2>
      <p className="mb-6 text-sm text-muted">
        No password needed. We&apos;ll email you a one-time sign-in link.
      </p>

      {callbackError && (
        <Alert className="mb-4">
          {CALLBACK_ERRORS[callbackError] ??
            "We couldn't sign you in. Request a new link below."}
        </Alert>
      )}

      <label htmlFor="email" className="mb-1 block text-sm text-muted">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input mb-5 w-full"
        placeholder="you@example.com"
      />

      <Button type="submit" disabled={status === "sending"} className="w-full">
        {status === "sending" ? "Sending..." : "Email me a sign-in link"}
      </Button>

      {status === "error" && (
        <Alert className="mt-4">
          Something went wrong sending that link. Check your connection and try
          again.
        </Alert>
      )}
    </form>
  );
}
