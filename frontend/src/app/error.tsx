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
        description={error.message || "An unexpected error occurred while loading this page."}
        action={<Button onClick={reset}>Try again</Button>}
        secondaryAction={
          <Link href="/">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        }
      />
    </div>
  );
}