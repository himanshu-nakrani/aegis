"use client";

import { type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import type { NodeData } from "@/types/workflow";
import { BaseNode } from "./BaseNode";

export function LLMNode(props: NodeProps) {
  const data = props.data as NodeData & { config?: { model?: string } };
  const model = data.config?.model;
  const footer = model ? <span className="text-micro">{model}</span> : null;
  return <BaseNode {...props} icon={<Sparkles className="h-3.5 w-3.5" />} footer={footer} />;
}