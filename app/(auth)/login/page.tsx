import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { LoginHero } from "@/components/auth/login-hero";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen flex-1 bg-background lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <LoginHero />

      <section className="flex flex-col px-4 py-10 sm:px-10 lg:min-h-screen lg:py-12">
        <div className="flex flex-1 flex-col items-center justify-center">
          {/* Fallback mirrors the form's frame so the card doesn't pop in at
              a different size once useSearchParams resolves on the client. */}
          <Suspense
            fallback={
              <div className="w-full max-w-sm border border-divider bg-neutral-100 p-8 shadow-md">
                <p className="text-sm text-muted">Loading…</p>
              </div>
            }
          >
            <LoginForm />
          </Suspense>

          <p className="mt-6 max-w-sm text-center text-sm text-muted">
            Hansen Health is invite only. Ask whoever set up your family to
            send you an invite.
          </p>
        </div>

        <p className="mt-10 text-center text-xs text-muted">
          Your health log is private by default.
        </p>
      </section>
    </main>
  );
}
