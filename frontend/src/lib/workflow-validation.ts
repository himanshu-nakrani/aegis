import type { Node } from "@xyflow/react";
import type { NodeData } from "@/types/workflow";

export interface WorkflowFieldIssue {
  nodeId: string;
  nodeLabel: string;
  field: string;
  message: string;
}

export function getWorkflowValidationIssues(nodes: Node[]): WorkflowFieldIssue[] {
  const issues: WorkflowFieldIssue[] = [];

  for (const node of nodes) {
    const data = node.data as NodeData;
    const label = data.label?.trim() || node.id;

    if (data.nodeType === "agent" && !data.instruction?.trim()) {
      issues.push({
        nodeId: node.id,
        nodeLabel: label,
        field: "instruction",
        message: "Instruction is required",
      });
    }

    if (
      data.nodeType === "trigger" &&
      data.triggerType === "schedule" &&
      !data.scheduleCron?.trim()
    ) {
      issues.push({
        nodeId: node.id,
        nodeLabel: label,
        field: "scheduleCron",
        message: "Cron expression is required for scheduled triggers",
      });
    }

    if (data.nodeType === "tool" && data.toolType === "http" && !data.httpUrl?.trim()) {
      issues.push({
        nodeId: node.id,
        nodeLabel: label,
        field: "httpUrl",
        message: "Request URL is required",
      });
    }

    if (data.nodeType === "integration") {
      if (!data.credentialName?.trim()) {
        issues.push({
          nodeId: node.id,
          nodeLabel: label,
          field: "credentialName",
          message: "Credential is required",
        });
      }
      if (data.integrationType === "postgres" && !data.integrationQuery?.trim()) {
        issues.push({
          nodeId: node.id,
          nodeLabel: label,
          field: "integrationQuery",
          message: "SQL query is required",
        });
      }
    }
  }

  return issues;
}

export function formatValidationToast(issues: WorkflowFieldIssue[]): string {
  const first = issues[0];
  const nodeTypeLabel =
    first.field === "instruction"
      ? "Agent"
      : first.field === "scheduleCron"
        ? "Schedule trigger"
        : first.field === "credentialName"
          ? "Integration"
          : first.field === "httpUrl"
            ? "HTTP Request"
            : "Node";
  return `${nodeTypeLabel} node '${first.nodeLabel}' is missing required fields`;
}