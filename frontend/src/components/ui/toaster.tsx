"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "panel text-foreground",
          description: "text-muted",
          actionButton: "bg-primary text-primary-foreground",
        },
      }}
    />
  );
}