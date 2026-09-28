import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/ui/copy-button";

const MAX_HEIGHT = {
  none: undefined,
  sm: "max-h-32 overflow-auto",
  md: "max-h-80 overflow-auto",
} as const;

/**
 * Scrollable monospace output block with an optional copy affordance — the house
 * treatment for anything the model or the API produced (final output, prompts,
 * completions, approval payloads, raw errors). Wrapping + `break-words` keep
 * long tokens and URLs from widening their container.
 */
export function OutputBlock({
  children,
  maxHeight = "none",
  copyValue,
  className,
}: {
  children: React.ReactNode;
  maxHeight?: keyof typeof MAX_HEIGHT;
  copyValue?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <pre
        className={cn(
          "whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground",
          copyValue !== undefined && "pr-10",
          MAX_HEIGHT[maxHeight]
        )}
      >
        {children}
      </pre>
      {copyValue !== undefined && (
        <CopyButton text={copyValue} className="absolute right-2 top-2" />
      )}
    </div>
  );
}
