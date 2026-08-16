"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Error boundary for the whole signed-in route group. Sits below
// app/(app)/layout.tsx, so the nav stays rendered and interactive -- a
// failed dashboard query shouldn't strand the user on a page with no way
// out, which is what the root app/error.tsx (above the layout) would do.
//
// Next 16 passes `unstable_retry`, which re-runs the failed segment's data
// fetching. That's the right recovery here: these failures are almost
// always a transient Supabase/network hiccup, and `reset` alone would
// re-render the same already-failed payload.
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("App route error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold text-foreground">
        Couldn&rsquo;t load this page
      </h1>
      <p className="mb-6 text-muted">
        This is usually a temporary connection problem. Try again, and if it
        keeps happening you can head back to the dashboard.
      </p>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button type="button" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Link href="/" className="text-sm text-muted underline">
          Back to dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-muted">Reference: {error.digest}</p>
      )}
    </div>
  );
}
