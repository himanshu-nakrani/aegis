import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `cn` must know our custom theme keys. Tailwind-merge classifies `text-*` by
 * theme scale: without this, `text-title`/`text-micro`/… fall into the
 * `text-color` group and silently win-or-lose against `text-foreground`.
 * Same for the shadow and radius scales.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "2xs",
        "micro",
        "title",
        "page",
        "page-lg",
        "metric",
        "display",
        "display-lg",
      ],
      shadow: [
        "elev-1",
        "elev-2",
        "elev-3",
        "sheen",
        "hairline-b",
        "rule-strong",
        "rule-primary",
        "glow-primary",
        "glow-accent",
        "glow-active",
        "glow-success",
        "glow-destructive",
        "glow-warning",
      ],
      radius: ["sm", "md", "lg", "xl", "2xl"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Cheap stable string hash (djb2) — cache keys, not cryptography. */
export function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}
