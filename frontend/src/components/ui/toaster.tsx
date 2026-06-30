"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      expand
      visibleToasts={4}
      toastOptions={{
        duration: 3500,
        classNames: {
          toast:
            "group bg-surface-elevated backdrop-blur-xl border border-border rounded-xl shadow-elev-2 p-4",
          title: "text-body font-medium",
          description: "text-caption",
          success: "border-l-2 border-l-success shadow-glow-success",
          error: "border-l-2 border-l-destructive shadow-glow-destructive",
          info: "",
          loading: "",
          actionButton: "bg-primary text-primary-foreground",
          closeButton: "border-border bg-surface-elevated text-muted hover:text-foreground",
        },
      }}
      {...props}
    />
  );
}