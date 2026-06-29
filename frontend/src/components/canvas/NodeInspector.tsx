"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type {
  EvalPreset,
  GuardrailFailBehavior,
  GuardrailMode,
  HttpMethod,
  NodeData,
  SearchProvider,
  SummaryStyle,
} from "@/types/workflow";

interface NodeInspectorProps {
  nodeId: string | null;
  data: NodeData | null;
  onChange: (nodeId: string, data: NodeData) => void;
}

export function NodeInspector({ nodeId, data, onChange }: NodeInspectorProps) {
  const [evalPresets, setEvalPresets] = useState<EvalPreset[]>([]);

  useEffect(() => {
    api.listEvalPresets().then(setEvalPresets).catch(() => {});
  }, []);

  if (!nodeId || !data) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-400">No selection</p>
        <p className="mt-1 text-xs">Click a node or connection to configure it</p>
      </div>
    );
  }

  const update = (patch: Partial<NodeData>) => onChange(nodeId, { ...data, ...patch });

  const handlePresetChange = (presetId: string) => {
    const preset = evalPresets.find((p) => p.id === presetId);
    update({
      evalPreset: presetId || undefined,
      criteria: preset?.criteria ?? data.criteria,
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Node</p>
        <p className="mt-0.5 text-sm font-medium capitalize text-slate-200">{data.nodeType}</p>
      </div>

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
        <>
          <div className="space-y-2">
            <Label>Eval Preset</Label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              value={data.evalPreset || ""}
              onChange={(e) => handlePresetChange(e.target.value)}
            >
              <option value="">Custom criteria</option>
              {evalPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Criteria</Label>
            <Textarea
              rows={3}
              value={data.criteria || ""}
              onChange={(e) => update({ criteria: e.target.value })}
            />
          </div>
        </>
      )}

      {data.nodeType === "summarizer" && (
        <div className="space-y-2">
          <Label>Summary Style</Label>
          <select
            className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
            value={data.summaryStyle || "concise"}
            onChange={(e) => update({ summaryStyle: e.target.value as SummaryStyle })}
          >
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
            <option value="bullet">Bullet points</option>
          </select>
        </div>
      )}

      {data.nodeType === "translator" && (
        <div className="space-y-2">
          <Label>Target Language</Label>
          <Input
            value={data.targetLanguage || "English"}
            onChange={(e) => update({ targetLanguage: e.target.value })}
            placeholder="Spanish, French, Hindi..."
          />
        </div>
      )}

      {data.nodeType === "extractor" && (
        <div className="space-y-2">
          <Label>Fields to Extract (comma-separated)</Label>
          <Input
            value={(data.extractFields || []).join(", ")}
            onChange={(e) =>
              update({
                extractFields: e.target.value
                  .split(",")
                  .map((f) => f.trim())
                  .filter(Boolean),
              })
            }
            placeholder="summary, entities, dates"
          />
        </div>
      )}

      {data.nodeType === "transform" && (
        <div className="space-y-2">
          <Label>Template</Label>
          <Textarea
            rows={4}
            value={data.template || "{{input}}"}
            onChange={(e) => update({ template: e.target.value })}
            placeholder="Use {{input}} for upstream output"
          />
        </div>
      )}

      {data.nodeType === "json_parse" && (
        <div className="space-y-2">
          <Label>JSON Path (optional)</Label>
          <Input
            value={data.jsonPath || ""}
            onChange={(e) => update({ jsonPath: e.target.value })}
            placeholder="e.g. data.items.0.name"
          />
        </div>
      )}

      {data.nodeType === "delay" && (
        <div className="space-y-2">
          <Label>Delay (seconds)</Label>
          <Input
            type="number"
            min={0.1}
            max={30}
            step={0.1}
            value={data.delaySeconds ?? 1}
            onChange={(e) => update({ delaySeconds: Number(e.target.value) })}
          />
        </div>
      )}

      {data.nodeType === "note" && (
        <div className="space-y-2">
          <Label>Note</Label>
          <Textarea
            rows={4}
            value={data.noteText || ""}
            onChange={(e) => update({ noteText: e.target.value })}
            placeholder="Document intent, TODOs, or team notes"
          />
        </div>
      )}

      {data.nodeType === "tool" && data.toolType === "http" && (
        <>
          <div className="space-y-2">
            <Label>Method</Label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              value={data.httpMethod || "GET"}
              onChange={(e) => update({ httpMethod: e.target.value as HttpMethod })}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>URL</Label>
            <Input
              value={data.httpUrl || ""}
              onChange={(e) => update({ httpUrl: e.target.value })}
              placeholder="https://api.example.com/endpoint"
            />
          </div>
          <div className="space-y-2">
            <Label>Body Template (optional)</Label>
            <Textarea
              rows={3}
              value={data.httpBody || ""}
              onChange={(e) => update({ httpBody: e.target.value })}
              placeholder='{"query": "{{input}}"}'
            />
          </div>
        </>
      )}

      {data.nodeType === "router" && (
        <div className="space-y-2">
          <Label>Routes (comma-separated)</Label>
          <Input
            value={(data.routes || []).join(", ")}
            onChange={(e) =>
              update({
                routes: e.target.value
                  .split(",")
                  .map((r) => r.trim())
                  .filter(Boolean),
              })
            }
            placeholder="math, general, fallback"
          />
          <p className="text-xs text-slate-500">
            Label outgoing edges with matching route keys in the edge inspector.
          </p>
        </div>
      )}

      {data.nodeType === "classifier" && (
        <div className="space-y-2">
          <Label>Categories (comma-separated)</Label>
          <Input
            value={(data.categories || []).join(", ")}
            onChange={(e) =>
              update({
                categories: e.target.value
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean),
              })
            }
            placeholder="support, sales, billing"
          />
          <p className="text-xs text-slate-500">
            Label outgoing edges with category names for branching.
          </p>
        </div>
      )}

      {data.nodeType === "join" && (
        <p className="text-xs text-slate-500">
          Merges parallel branches. Connect multiple incoming edges to this node.
        </p>
      )}

      {data.nodeType === "guardrail" && (
        <>
          <div className="space-y-2">
            <Label>Mode</Label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              value={data.rules?.mode || "output"}
              onChange={(e) =>
                update({
                  rules: { ...data.rules, mode: e.target.value as GuardrailMode },
                })
              }
            >
              <option value="input">Input (before agent)</option>
              <option value="output">Output (after agent)</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Fail Behavior</Label>
            <select
              className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              value={data.rules?.fail_behavior || "block"}
              onChange={(e) =>
                update({
                  rules: {
                    ...data.rules,
                    fail_behavior: e.target.value as GuardrailFailBehavior,
                  },
                })
              }
            >
              <option value="block">Block (stop workflow)</option>
              <option value="warn">Warn (continue)</option>
            </select>
          </div>

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

          <div className="space-y-2">
            <Label>Max Length</Label>
            <Input
              type="number"
              min={1}
              value={data.rules?.max_length ?? ""}
              onChange={(e) =>
                update({
                  rules: {
                    ...data.rules,
                    max_length: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
              placeholder="e.g. 500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={data.rules?.detect_pii ?? false}
              onChange={(e) =>
                update({
                  rules: { ...data.rules, detect_pii: e.target.checked },
                })
              }
              className="rounded border-slate-600"
            />
            Detect PII (email, phone)
          </label>
        </>
      )}
    </div>
  );
}