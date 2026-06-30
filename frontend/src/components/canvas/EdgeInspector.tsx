"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
      <div className="inspector-empty">
        <p className="text-sm text-muted">Select a connection to edit route labels.</p>
      </div>
    );
  }

  const route = (edge.data as { route?: string } | undefined)?.route ?? edge.label ?? "";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <div>
          <p className="text-xs font-medium text-muted">Connection</p>
          <p className="mt-1 text-sm text-foreground">
            {sourceLabel ?? edge.source} → {targetLabel ?? edge.target}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete connection"
          onClick={() => onDelete(edge.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Route label</Label>
        {routerRoutes && routerRoutes.length > 0 ? (
          <Select
            value={String(route) || undefined}
            onValueChange={(value) => onChange(edge.id, { route: value, label: value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Default (no route)" />
            </SelectTrigger>
            <SelectContent>
              {routerRoutes.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={String(route)}
            onChange={(e) => onChange(edge.id, { route: e.target.value, label: e.target.value })}
            placeholder="e.g. route_a"
          />
        )}
        <p className="form-hint">Required for router, IF, and Switch branches.</p>
      </div>
    </div>
  );
}