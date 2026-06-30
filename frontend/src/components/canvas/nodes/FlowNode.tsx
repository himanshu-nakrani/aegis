"use client";

import { type NodeProps } from "@xyflow/react";
import { Workflow } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function FlowNode(props: NodeProps) {
  return <BaseNode {...props} icon={<Workflow className="h-3.5 w-3.5" />} />;
}