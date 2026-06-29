"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NodeData, SearchProvider } from "@/types/workflow";

interface NodeInspectorProps {
  nodeId: string | null;
  data: NodeData | null;
  onChange: (nodeId: string, data: NodeData) => void;
}

export function NodeInspector({ nodeId, data, onChange }: NodeInspectorProps) {
  if (!nodeId || !data) {
    return (
      <div className="w-72 rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-400">
        Select a node to edit its configuration.
      </div>
    );
  }

  const update = (patch: Partial<NodeData>) => onChange(nodeId, { ...data, ...patch });

  return (
    <div className="flex w-72 flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Inspector</p>

      <div className="space-y-2">
        <Label>Label</Label>
        <Input value={data.label} onChange={(e) => update({ label: e.target.value })} />
      </div>

      {data.nodeType === "agent" && (
        <div className="space-y-2">
          <Label>Instruction</Label>
          <Textarea
            rows={5}
            value={data.instruction || ""}
            onChange={(e) => update({ instruction: e.target.value })}
          />
        </div>
      )}

      {data.nodeType === "tool" && data.toolType === "search" && (
        <div className="space-y-2">
          <Label>Search Provider</Label>
          <select
            className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
            value={data.searchProvider || "google"}
            onChange={(e) => update({ searchProvider: e.target.value as SearchProvider })}
          >
            <option value="google">Google Search (default)</option>
            <option value="exa">EXA</option>
            <option value="duckduckgo">DuckDuckGo</option>
          </select>
        </div>
      )}

      {data.nodeType === "evaluation" && (
        <div className="space-y-2">
          <Label>Criteria</Label>
          <Input
            value={data.criteria || ""}
            onChange={(e) => update({ criteria: e.target.value })}
          />
        </div>
      )}

      {data.nodeType === "guardrail" && (
        <>
          <div className="space-y-2">
            <Label>Blocked Keywords (comma-separated)</Label>
            <Input
              value={(data.rules?.blocked_keywords || []).join(", ")}
              onChange={(e) =>
                update({
                  rules: {
                    ...data.rules,
                    blocked_keywords: e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Required Regex Pattern</Label>
            <Input
              value={data.rules?.pattern || ""}
              onChange={(e) =>
                update({
                  rules: { ...data.rules, pattern: e.target.value },
                })
              }
              placeholder="e.g. ^[A-Za-z].*"
            />
          </div>
        </>
      )}
    </div>
  );
}