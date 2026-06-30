"use client";

import { type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function DataNode(props: NodeProps) {
  return <BaseNode {...props} icon={<Database className="h-3.5 w-3.5" />} />;
}