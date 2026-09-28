import { PageEnter } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * The uniform page chrome: centered container, one vertical rhythm (space-y-6),
 * and the shared enter animation. Routes compose their sections inside it;
 * loading/error shells keep their own bare `page-container` so swapping states
 * never replays the enter animation.
 */
export function Page({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <PageEnter className={cn("page-container space-y-6", className)}>
      {children}
    </PageEnter>
  );
}
