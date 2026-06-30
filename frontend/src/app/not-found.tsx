import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="page-container flex min-h-[60vh] items-center justify-center">
      <EmptyState
        icon={FileQuestion}
        title="Page not found"
        description="The page you're looking for doesn't exist or may have been moved."
        action={
          <Link href="/">
            <Button>Back to dashboard</Button>
          </Link>
        }
        secondaryAction={
          <Link href="/templates">
            <Button variant="outline">Browse templates</Button>
          </Link>
        }
      />
    </div>
  );
}