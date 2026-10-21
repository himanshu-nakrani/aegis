"use client";

import { ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_EVENT } from "./Workbench";
import s from "./landing.module.css";

/** Hero incident line: clicking opens the failed node in the workbench preview below. */
export function IncidentLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: "search" }))}
      className={cn(
        "group mt-8 block w-full rounded-md border border-transparent border-t-border px-0 pt-5 text-left font-mono text-[11.5px] leading-[1.65] hover:border-destructive/30 hover:bg-destructive/5 hover:px-3 hover:pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        s.incident
      )}
      aria-label="Inspect the Web Search incident in the workbench preview"
    >
      <span className="block text-muted">
        <span className="text-destructive">INCIDENT</span> · Web Search timed out — the run paused itself before the
        guardrail.
      </span>
      <span className="mt-2 block text-subtle/80">
        node.search → ETIMEDOUT after 30.0s · retry policy armed (3 attempts) · run held pre-guardrail
      </span>
      <span className="mt-2 inline-flex items-center gap-1 text-destructive/80 opacity-70 transition-opacity duration-1 group-hover:opacity-100">
        inspect in workbench <ArrowDownRight className="h-3 w-3" aria-hidden />
      </span>
    </button>
  );
}
