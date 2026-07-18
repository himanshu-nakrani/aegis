"use client";

import { type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { BaseNode, NodeChipRow } from "./BaseNode";

export function LLMNode(props: NodeProps) {
  const data = props.data as NodeData & { config?: { model?: string } };
  const model = data.config?.model;

  const chips: string[] = [];
  if (model) chips.push(model);
  if (data.summaryStyle) chips.push(data.summaryStyle);
  if (data.targetLanguage) chips.push(data.targetLanguage);
  if (data.searchProvider) chips.push(data.searchProvider);

  const footer = chips.length ? <NodeChipRow chips={chips} /> : null;
  return <BaseNode {...props} icon={<Sparkles className="h-3.5 w-3.5" />} footer={footer} />;
}
