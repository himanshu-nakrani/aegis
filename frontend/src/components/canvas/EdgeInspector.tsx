"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Edge } from "@xyflow/react";

interface EdgeInspectorProps {
  edge: Edge | null;
  sourceLabel?: string;
  targetLabel?: string;
  routerRoutes?: string[];
  onChange: (edgeId: string, updates: { route?: string; label?: string }) => void;
  onDelete: (edgeId: string) => void;
}

export function EdgeInspector({
  edge,
  sourceLabel,
  targetLabel,
  routerRoutes,
  onChange,
  onDelete,
}: EdgeInspectorProps) {
  if (!edge) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">
        Select a connection to edit route labels.
      </div>
    );
  }

  const route = (edge.data as { route?: string } | undefined)?.route ?? edge.label ?? "";

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Connection</p>
          <p className="mt-1 text-sm text-slate-200">
            {sourceLabel ?? edge.source} → {targetLabel ?? edge.target}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-slate-500 hover:text-rose-400"
          onClick={() => onDelete(edge.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Route label</Label>
        {routerRoutes && routerRoutes.length > 0 ? (
          <select
            className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
            value={String(route)}
            onChange={(e) =>
              onChange(edge.id, { route: e.target.value, label: e.target.value })
            }
          >
            <option value="">Default (no route)</option>
            {routerRoutes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <Input
            value={String(route)}
            onChange={(e) =>
              onChange(edge.id, { route: e.target.value, label: e.target.value })
            }
            placeholder="e.g. route_a"
          />
        )}
        <p className="text-xs text-slate-500">
          Required for router branches. Shown on the canvas edge.
        </p>
      </div>
    </div>
  );
}