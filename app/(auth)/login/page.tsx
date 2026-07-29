import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      {/* Fallback mirrors the form's frame so the card doesn't pop in at a
          different size once useSearchParams resolves on the client. */}
      <Suspense
        fallback={
          <div className="w-full max-w-sm border border-divider p-6">
            <p className="text-sm text-muted">Loading…</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
      <p className="mt-6 max-w-sm text-center text-sm text-muted">
        Invite only — ask whoever set up your family to send you an invite.
      </p>
    </div>
  );
}
