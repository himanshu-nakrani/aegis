import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { WorkflowTemplate } from "@/types/workflow";

/**
 * Shared "use template" flow — mirrors templates/page.tsx handleUseTemplate:
 * create a workflow from the template graph, invalidate the affected caches,
 * and surface success/error toasts. Callers handle navigation on resolve.
 */
export async function createWorkflowFromTemplate(
  queryClient: QueryClient,
  template: WorkflowTemplate,
  opts?: { name?: string }
) {
  try {
    // P7d: create from the listed graph first so a failed create can't
    // increment usage_count; count only after the workflow exists. The
    // listed graph is the one the UI previewed for the user anyway.
    const workflow = await api.createWorkflow({
      name: opts?.name ?? template.name,
      description: template.description,
      graph_json: template.graph_json,
    });
    // Best-effort: usage count must not block the toast/navigation path.
    void api.useTemplate(template.id).catch(() => undefined);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows }),
      queryClient.invalidateQueries({ queryKey: queryKeys.observabilitySummary }),
      queryClient.invalidateQueries({ queryKey: queryKeys.templates }),
    ]);
    toast.success(`Created workflow from "${template.name}"`);
    return workflow;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create workflow");
    throw error;
  }
}
