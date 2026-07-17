"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-xl font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="mb-6 text-muted">
        Sorry about that. You can try again, or come back later if it keeps
        happening.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
