"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this page</h1>
      <p className="mt-2 text-sm text-muted">
        The database didn&apos;t answer. Check your connection and try again.
      </p>
      <button type="button" onClick={() => unstable_retry()} className={`${buttonClass} mt-6`}>
        Try again
      </button>
    </div>
  );
}
