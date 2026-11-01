import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex min-h-[88px] w-full min-w-0 rounded-md border border-border bg-surface-input px-3 py-2.5 text-sm leading-6 text-foreground outline-none transition-[border-color,box-shadow] duration-1 placeholder:text-subtle hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-surface disabled:text-subtle disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20",
          className
        )}
        {...props}
      />
    )
  }
)

export { Textarea }
