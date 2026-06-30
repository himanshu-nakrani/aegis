"use client";

import { type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function LogicNode(props: NodeProps) {
  return <BaseNode {...props} icon={<GitBranch className="h-3.5 w-3.5" />} />;
}