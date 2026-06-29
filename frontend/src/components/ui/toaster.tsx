"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "bg-slate-900 border border-slate-700 text-slate-100",
          description: "text-slate-400",
        },
      }}
    />
  );
}