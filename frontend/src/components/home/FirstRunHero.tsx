"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutTemplate, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { createWorkflowFromTemplate } from "@/lib/create-from-template";
import { dismissOnboarding, isOnboardingDismissed } from "@/lib/onboarding";

/**
 * First-run panel shown in place of the empty-library EmptyState. Renders null
 * on the server and first client paint (hydration-safe) and when dismissed —
 * the page falls back to its existing EmptyState in that case.
 */
export function FirstRunHero({ fallback }: { fallback: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    setReady(!isOnboardingDismissed("dashboard"));
  }, []);

  if (!ready) return <>{fallback}</>;

  const handleDismiss = () => {
    dismissOnboarding("dashboard");
    setReady(false);
  };

  const handleCreateFromTemplate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const templates = await queryClient.fetchQuery({
        queryKey: queryKeys.templates,
        queryFn: api.listTemplates,
      });
      const first = templates[0];
      if (!first) {
        router.push("/templates");
        return;
      }
      // O6: createWorkflowFromTemplate already routes through useTemplate —
      // calling it here too double-counted persisted template usage.
      const workflow = await createWorkflowFromTemplate(queryClient, first, {
        name: "My first workflow",
      });
      router.push(`/workflows/${workflow.id}`);
    } catch {
      // toast surfaced by createWorkflowFromTemplate / fetch errors
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="relative border-y border-border py-12 sm:px-6 sm:py-16">
      <Button variant="ghost" size="icon-sm" onClick={handleDismiss} aria-label="Dismiss getting started" className="absolute right-4 top-4 text-muted"><X className="h-4 w-4" /></Button>
      <p className="mb-3 text-xs font-medium text-subtle">Getting started</p>
      <h2 className="text-title tracking-tight text-foreground sm:text-page">No workflows yet</h2>
      <p className="mt-3 max-w-lg text-sm leading-6 text-muted">A workflow connects agents, tools, and logic. Create a sample to explore the canvas, or start from scratch.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button onClick={handleCreateFromTemplate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutTemplate className="h-4 w-4" />}
          {creating ? "Creating…" : "Create a sample workflow"}
        </Button>
        <Button asChild variant="outline"><Link href="/workflows/new?starter=describe"><Sparkles className="h-4 w-4" />Describe a workflow</Link></Button>
        <Button asChild variant="ghost" className="text-muted"><Link href="/workflows/new?starter=blank"><Plus className="h-4 w-4" />Start from scratch</Link></Button>
      </div>
    </section>
  );
}
