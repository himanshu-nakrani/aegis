import { Button } from "@/components/ui/button";

/**
 * Compact inline failure row. A failed read must never fall through to an empty
 * state — "you have none of these" is a different (and alarming) claim than "we
 * couldn't reach the API".
 *
 * `message` is the short human claim; `detail` carries the raw error text on the
 * message's `title` so it stays inspectable without crowding the row.
 */
export function InlineQueryError({
  message,
  onRetry,
  detail,
}: {
  message: string;
  onRetry: () => void;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-2.5 py-1.5">
      <p className="text-xs text-destructive" title={detail}>
        {message}
      </p>
      <Button variant="ghost" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
