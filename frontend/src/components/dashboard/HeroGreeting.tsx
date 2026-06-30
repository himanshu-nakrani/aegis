"use client";

import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  /** User's display name, or null/undefined for a nameless greeting. */
  name?: string | null;
  /** Optional secondary info line. */
  meta?: string;
  /** Last-edited workflow id, used to power the "Open last canvas" CTA. Hide CTA if absent. */
  lastWorkflowId?: string | null;
};

function partOfDay(d = new Date()): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export function HeroGreeting({ name, meta, lastWorkflowId }: Props) {
  const part = partOfDay();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <h1 className="text-display">
          Good {part}
          {name ? ", " : ""}
          {name && <span className="text-gradient-primary">{name}</span>}
        </h1>
        {meta && <p className="text-caption">{meta}</p>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="default">
          <Link href="/workflows/new">
            <Plus className="mr-2 h-4 w-4" />
            New workflow
          </Link>
        </Button>
        {lastWorkflowId && (
          <Button asChild variant="outline">
            <Link href={`/workflows/${lastWorkflowId}/edit`}>
              Open last canvas <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}