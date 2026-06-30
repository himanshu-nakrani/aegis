import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-surface text-foreground border-border",
        primary: "bg-primary-muted text-primary-300 border-primary/20",
        success: "bg-success/12 text-success border-success/20",
        warning: "bg-warning/12 text-warning border-warning/20",
        destructive: "bg-destructive/12 text-destructive border-destructive/20",
        accent: "border-accent/25 bg-accent-muted text-accent",
        outline: "border-border text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}