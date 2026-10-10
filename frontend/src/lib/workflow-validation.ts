import type { Edge, Node } from "@xyflow/react";
import { triggerCronEntries, type NodeData } from "@/types/workflow";

export interface WorkflowFieldIssue {
  nodeId: string;
  nodeLabel: string;
  field: string;
  message: string;
}

/** Validate a 5-field cron expression (minute hour dom month dow). */
export function isValidCronExpression(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const isField = (part: string, min: number, max: number): boolean => {
    // Allow *, ranges, lists, steps — e.g. *, */5, 1-5, 1,15, 0-30/5
    const segments = part.split(",");
    for (const seg of segments) {
      if (!seg) return false;
      const [rangePart, stepPart] = seg.split("/");
      if (stepPart !== undefined) {
        if (!/^\d+$/.test(stepPart)) return false;
        const step = Number(stepPart);
        if (!Number.isFinite(step) || step < 1) return false;
      }
      if (rangePart === "*") continue;
      const [lo, hi] = rangePart.split("-");
      if (hi !== undefined) {
        if (!/^\d+$/.test(lo) || !/^\d+$/.test(hi)) return false;
        const a = Number(lo);
        const b = Number(hi);
        if (a < min || b > max || a > b) return false;
      } else {
        if (!/^\d+$/.test(rangePart)) return false;
        const n = Number(rangePart);
        if (n < min || n > max) return false;
      }
    }
    return true;
  };

  const [minute, hour, dom, month, dow] = parts;
  return (
    isField(minute, 0, 59) &&
    isField(hour, 0, 23) &&
    isField(dom, 1, 31) &&
    isField(month, 1, 12) &&
    isField(dow, 0, 7) // 0 and 7 both Sunday in common cron dialects
  );
}

function attachedToolNodeIds(nodes: Node[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    const data = node.data as NodeData;
    if (data.nodeType !== "agent" || !Array.isArray(data.tools)) continue;
    for (const reference of data.tools) {
      if (reference?.kind === "node" && typeof reference.nodeId === "string") {
        ids.add(reference.nodeId);
      }
    }
  }
  return ids;
}

/** Canvas declarations stay persisted but are not runnable workflow steps. */
export function getExecutableNodes(nodes: Node[]): Node[] {
  const declarations = attachedToolNodeIds(nodes);
  return nodes.filter((node) => {
    const type = (node.data as NodeData).nodeType;
    return type !== "note" && type !== "group" && !declarations.has(node.id);
  });
}

export function getWorkflowValidationIssues(nodes: Node[], edges: Edge[] = []): WorkflowFieldIssue[] {
  const issues: WorkflowFieldIssue[] = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const idCounts = new Map<string, number>();
  for (const node of nodes) idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1);

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

    const report = (field: string, message: string) => {
      issues.push({ nodeId: node.id, nodeLabel: label, field, message });
    };
    if (data.nodeType === "agent") {
      for (const field of ["maxToolIterations", "tokenBudget"] as const) {
        const value = data[field];
        if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
          report(field, "Must be a positive integer");
        }
      }
      if (data.tools !== undefined && !Array.isArray(data.tools)) {
        report("tools", "Tools must be a list of stable references");
      } else {
        const identities = new Set<string>();
        if (data.tools?.length && idCounts.get(node.id) !== 1) {
          report("tools", "Agent tool references require a unique node ID");
        }
        for (const reference of data.tools ?? []) {
          if (!reference || typeof reference !== "object") {
            report("tools", "Tool references must be objects");
            continue;
          }
          const kind = reference.kind;
          const required = kind === "node" ? ["kind", "nodeId"] : kind === "mcp" ? ["kind", "credentialId", "toolName"] : [];
          if (!required.length) {
            report("tools", "Unknown tool reference kind");
            continue;
          }
          if (required.some((key) => !(key in reference)) || Object.keys(reference).some((key) => ![...required, "requireApproval"].includes(key))) {
            report("tools", "Tools accept stable references only, not inline configuration or secrets");
            continue;
          }
          if (reference.requireApproval !== undefined && typeof reference.requireApproval !== "boolean") {
            report("tools", "Tool approval policy must be a boolean");
          }
          let identity: string;
          if (reference.kind === "node") {
            const targetId = reference.nodeId;
            identity = JSON.stringify(["node", targetId]);
            const target = nodesById.get(targetId);
            if (typeof targetId !== "string" || !targetId.trim()) {
              report("tools", "Tool node ID is required");
            } else if (targetId === node.id) {
              report("tools", "An agent cannot reference itself as a tool");
            } else if ((idCounts.get(targetId) ?? 0) > 1) {
              report("tools", `Tool node '${targetId}' has an ambiguous ID`);
            } else if (!target) {
              report("tools", `Referenced Tool node '${targetId}' is missing; restore it or remove this reference`);
            } else if ((target.data as NodeData).nodeType !== "tool") {
              report("tools", `Referenced node '${targetId}' is not a Tool node`);
            } else if (!["calculator", "http", "search"].includes((target.data as NodeData).toolType ?? "calculator")) {
              report("tools", `Tool node '${targetId}' has an unsupported tool type`);
            } else if (edges.some((edge) => edge.source === targetId || edge.target === targetId)) {
              report("tools", `Attached Tool node '${targetId}' must be disconnected from workflow edges`);
            }
          } else {
            const credentialId = reference.credentialId;
            identity = JSON.stringify(["mcp", typeof credentialId === "string" ? credentialId.toLowerCase() : credentialId, reference.toolName]);
            if (typeof credentialId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(credentialId)) {
              report("tools", "MCP credential ID must be a UUID");
            }
            if (typeof reference.toolName !== "string" || !reference.toolName.trim()) {
              report("tools", "MCP tool name is required");
            }
          }
          if (identities.has(identity)) report("tools", "Duplicate tool reference");
          identities.add(identity);
        }
      }
    } else if (["tools", "maxToolIterations", "tokenBudget"].some((field) => field in data)) {
      report("tools", "Tool references and loop bounds are only supported on Agent nodes");
    }

    if (data.nodeType === "trigger" && data.triggerType === "schedule") {
      // scheduleCrons entries are trimmed/kept verbatim on save, so blank rows
      // surface as missing rather than silently dropped.
      const raw = data.scheduleCrons;
      const entries = Array.isArray(raw)
        ? raw.map((cron) => String(cron).trim())
        : triggerCronEntries(data);
      if (entries.length === 0 || entries.some((cron) => !cron)) {
        issues.push({
          nodeId: node.id,
          nodeLabel: label,
          field: "scheduleCrons",
          message: "Cron expression is required for scheduled triggers",
        });
      } else if (entries.some((cron) => !isValidCronExpression(cron))) {
        issues.push({
          nodeId: node.id,
          nodeLabel: label,
          field: "scheduleCrons",
          message: "Cron expression is invalid (expected 5 fields: min hour dom month dow)",
        });
      }
    }

    // Declaration fields remain validated even though the Tool never executes
    // as a standalone step; they configure the attached function itself.
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
  if (["tools", "maxToolIterations", "tokenBudget"].includes(first.field)) {
    return `Node '${first.nodeLabel}': ${first.message}`;
  }
  const nodeTypeLabel =
    first.field === "instruction"
      ? "Agent"
      : first.field === "scheduleCrons"
        ? "Schedule trigger"
        : first.field === "credentialName"
          ? "Integration"
          : first.field === "httpUrl"
            ? "HTTP Request"
            : "Node";
  return `${nodeTypeLabel} node '${first.nodeLabel}' is missing required fields`;
}