import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-lg border border-border bg-surface-input px-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none transition-[border-color,background-color,box-shadow,color] placeholder:text-muted hover:border-border-strong hover:bg-surface-hover/50 focus-visible:border-primary/55 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:bg-surface disabled:text-subtle disabled:opacity-70 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
