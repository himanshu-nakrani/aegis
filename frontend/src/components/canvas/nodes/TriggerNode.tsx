"use client";

import { type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function TriggerNode(props: NodeProps) {
  return <BaseNode {...props} icon={<Zap className="h-3.5 w-3.5" />} />;
}