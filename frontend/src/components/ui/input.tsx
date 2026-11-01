import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `size` shadows the native (and unused) numeric `size` attribute so the API
 * matches SelectTrigger/Button: `<Input size="sm" />` is the dense h-8 variant.
 */
function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  size?: "sm" | "default"
}) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-border bg-surface-input px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-1 placeholder:text-subtle hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-surface disabled:text-subtle disabled:opacity-60 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/20 data-[size=sm]:h-8 data-[size=sm]:text-xs",
        className
      )}
      {...props}
    />
  )
}

export { Input }
