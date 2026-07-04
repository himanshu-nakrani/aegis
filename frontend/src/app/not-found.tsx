import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RecoveryState } from "@/components/ui/recovery-state";

export default function NotFound() {
  return (
    <div className="page-container flex min-h-[60vh] items-center justify-center">
      <RecoveryState
        tone="not-found"
        title="That route is not in this workspace"
        description="The URL does not map to a current Aegis surface. Jump back to a stable workspace area or browse reusable workflow templates."
        primaryAction={
          <Button asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        }
        secondaryAction={
          <Button variant="outline" asChild>
            <Link href="/templates">Browse templates</Link>
          </Button>
        }
        tertiaryAction={
          <Button variant="outline" asChild>
            <Link href="/workflows">View workflows</Link>
          </Button>
        }
      />
    </div>
  );
}
