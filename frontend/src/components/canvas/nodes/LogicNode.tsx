"use client";

import { type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { BaseNode, NodeChipRow } from "./BaseNode";

export function LogicNode(props: NodeProps) {
  const data = props.data as NodeData;

  const chips: string[] = [];
  if (data.ifCondition?.operator) chips.push(data.ifCondition.operator);
  if (data.filterCondition?.operator) chips.push(data.filterCondition.operator);
  if (data.switchCases?.length) chips.push(`${data.switchCases.length} cases`);
  if (data.routes?.length) chips.push(`${data.routes.length} routes`);

  const footer = chips.length ? <NodeChipRow chips={chips} /> : null;
  return <BaseNode {...props} icon={<GitBranch className="h-3.5 w-3.5" />} footer={footer} />;
}
