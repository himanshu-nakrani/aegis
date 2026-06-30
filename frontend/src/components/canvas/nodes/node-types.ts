import type { NodeTypes } from "@xyflow/react";
import { TriggerNode } from "./TriggerNode";
import { LogicNode } from "./LogicNode";
import { LLMNode } from "./LLMNode";
import { DataNode } from "./DataNode";
import { IntegrationNode } from "./IntegrationNode";
import { QualityNode } from "./QualityNode";
import { FlowNode } from "./FlowNode";
import type { NodeData } from "@/types/workflow";
import { categorize } from "./category";

export function flowNodeTypeForData(data: NodeData): string {
  return categorize(data.nodeType);
}

export const canvasNodeTypes: NodeTypes = {
  trigger: TriggerNode,
  logic: LogicNode,
  llm: LLMNode,
  data: DataNode,
  integration: IntegrationNode,
  quality: QualityNode,
  flow: FlowNode,
  baseNode: FlowNode,
};