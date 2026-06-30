"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="page-container flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description="Something went wrong loading this page. Try refreshing. If it keeps failing, open the browser console and report the error."
        action={
          <>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
            <Button variant="outline" onClick={reset}>
              Try again
            </Button>
          </>
        }
        secondaryAction={
          <Link href="/">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}