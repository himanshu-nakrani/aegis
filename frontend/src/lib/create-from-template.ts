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
    const workflow = await api.createWorkflow({
      name: opts?.name ?? template.name,
      description: template.description,
      graph_json: template.graph_json,
    });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workflows }),
      queryClient.invalidateQueries({ queryKey: queryKeys.observabilitySummary }),
    ]);
    toast.success(`Created workflow from "${template.name}"`);
    return workflow;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to create workflow");
    throw error;
  }
}
