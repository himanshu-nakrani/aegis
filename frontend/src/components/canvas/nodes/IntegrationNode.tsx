"use client";

import { type NodeProps } from "@xyflow/react";
import { Plug } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function IntegrationNode(props: NodeProps) {
  return <BaseNode {...props} icon={<Plug className="h-3.5 w-3.5" />} />;
}