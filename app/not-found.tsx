import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-xl font-semibold text-foreground">
        Page not found
      </h1>
      <p className="mb-6 text-muted">
        That page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/">
        <Button type="button">Back to dashboard</Button>
      </Link>
    </div>
  );
}
