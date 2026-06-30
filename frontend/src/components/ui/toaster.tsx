"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      richColors
      expand
      visibleToasts={4}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast: "panel text-foreground",
          description: "text-muted",
          actionButton: "bg-primary text-primary-foreground",
          closeButton: "border-border bg-surface-elevated text-muted hover:text-foreground",
        },
      }}
    />
  );
}