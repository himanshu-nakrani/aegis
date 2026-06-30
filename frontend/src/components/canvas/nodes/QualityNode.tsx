"use client";

import { type NodeProps } from "@xyflow/react";
import { Shield } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function QualityNode(props: NodeProps) {
  return <BaseNode {...props} icon={<Shield className="h-3.5 w-3.5" />} />;
}