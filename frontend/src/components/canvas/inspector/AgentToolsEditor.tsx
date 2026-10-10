"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, X } from "lucide-react";
import { InspectorSection } from "@/components/canvas/inspector/InspectorSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { AgentToolReference, MCPToolDescriptor, NodeData, WorkflowGraph } from "@/types/workflow";

interface AgentToolsEditorProps {
  data: NodeData;
  graph?: WorkflowGraph;
  fieldErrors?: Record<string, string>;
  onChange: (patch: Partial<NodeData>) => void;
}

function toolKey(ref: AgentToolReference): string {
  return ref.kind === "node"
    ? JSON.stringify(["node", ref.nodeId])
    : JSON.stringify(["mcp", ref.credentialId, ref.toolName]);
}

function ToolSchema({ tool }: { tool: MCPToolDescriptor }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="focus-ring cursor-pointer rounded-sm text-muted">Tool schema</summary>
      <p className="mt-2 text-muted">Input</p>
      <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-surface px-2 py-2 font-mono text-2xs">
        {JSON.stringify(tool.input_schema, null, 2)}
      </pre>
      {tool.output_schema && (
        <>
          <p className="mt-2 text-muted">Output</p>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-border bg-surface px-2 py-2 font-mono text-2xs">
            {JSON.stringify(tool.output_schema, null, 2)}
          </pre>
        </>
      )}
    </details>
  );
}

/** Attachment never changes graph topology or copies credential configuration. */
export function AgentToolsEditor({ data, graph, fieldErrors = {}, onChange }: AgentToolsEditorProps) {
  const id = useId();
  const queryClient = useQueryClient();
  const [credentialId, setCredentialId] = useState("");
  const refs = data.tools ?? [];
  const credentials = useQuery({ queryKey: queryKeys.credentials, queryFn: () => api.listCredentials() });
  const mcpCredentials = credentials.data?.filter((credential) => credential.type === "mcp") ?? [];
  const credentialIds = Array.from(new Set([
    ...refs.flatMap((ref) => ref.kind === "mcp" ? [ref.credentialId] : []),
    ...(credentialId ? [credentialId] : []),
  ])).filter((value) => mcpCredentials.some((credential) => credential.id === value));
  const toolQueries = useQueries({
    queries: credentialIds.map((value) => ({
      queryKey: queryKeys.mcpCredentialTools(value),
      queryFn: () => api.getMCPCredentialTools(value),
    })),
  });
  const refresh = useMutation({
    mutationFn: (value: string) => api.discoverMCPCredential(value),
    onSuccess: (result, value) => queryClient.setQueryData(queryKeys.mcpCredentialTools(value), result),
  });
  const selectedQuery = toolQueries[credentialIds.indexOf(credentialId)];
  const selectedCredential = mcpCredentials.find((credential) => credential.id === credentialId);
  const toolNodes = graph?.nodes.filter((node) => node.data.nodeType === "tool") ?? [];

  function nodeIssue(nodeId: string): string | undefined {
    if (!graph) return "Canvas topology is unavailable; this declaration cannot be checked.";
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return "Tool declaration is missing. Remove this reference or restore the node.";
    if (node.data.nodeType !== "tool") return "Referenced node is not a tool declaration.";
    if (graph.edges.some((edge) => edge.source === nodeId || edge.target === nodeId)) {
      return "Connected tools cannot be attached. Create a separate disconnected tool node, or explicitly remove its edges first.";
    }
    if (!["calculator", "http", "search"].includes(node.data.toolType ?? "")) {
      return "This tool type is not supported for agent attachment.";
    }
    return undefined;
  }

  function toggle(ref: AgentToolReference, checked: boolean) {
    const key = toolKey(ref);
    onChange({ tools: checked ? [...refs, ref] : refs.filter((existing) => toolKey(existing) !== key) });
  }

  function updateBound(field: "maxToolIterations" | "tokenBudget", value: string) {
    if (value === "") {
      onChange({ [field]: undefined });
      return;
    }
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) onChange({ [field]: parsed });
  }

  return (
    <InspectorSection title="Agent tools">
      <p className="form-hint">No attached tools keeps this agent single-shot. Attach reusable tool declarations or exact names discovered from an MCP credential.</p>
      {refs.length > 0 && (
        <div className="space-y-2" aria-label="Attached tools">
          {refs.map((ref, index) => {
            const node = ref.kind === "node" ? graph?.nodes.find((candidate) => candidate.id === ref.nodeId) : undefined;
            const credential = ref.kind === "mcp" ? mcpCredentials.find((candidate) => candidate.id === ref.credentialId) : undefined;
            const query = ref.kind === "mcp" ? toolQueries[credentialIds.indexOf(ref.credentialId)] : undefined;
            const descriptor = ref.kind === "mcp" ? query?.data?.tools.find((tool) => tool.name === ref.toolName) : undefined;
            const issue = ref.kind === "node"
              ? nodeIssue(ref.nodeId)
              : credentials.isSuccess && !credential
                ? "MCP credential is missing or no longer an MCP credential. This reference is preserved until you remove it."
                : query?.isSuccess && !descriptor
                  ? "Tool name is absent from the cached discovery. Refresh discovery or choose a listed tool."
                  : query?.isError ? "Could not load this tool's cached schema. Retry below." : undefined;
            return (
              <div key={`${toolKey(ref)}-${index}`} className="rounded-lg border border-border bg-surface-input px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all text-sm">{ref.kind === "node" ? node?.data.label ?? ref.nodeId : ref.toolName}</p>
                    <p className="break-all text-xs text-muted">{ref.kind === "node" ? `Canvas declaration · ${ref.nodeId}` : `${credential?.name ?? ref.credentialId} · MCP`}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Remove ${ref.kind === "node" ? node?.data.label ?? ref.nodeId : ref.toolName}`} onClick={() => onChange({ tools: refs.filter((_, row) => row !== index) })}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {issue && <p className="mt-2 text-xs text-destructive">{issue}</p>}
                {query?.isPending && <p className="mt-2 text-xs text-muted">Loading cached schema…</p>}
                {query?.isError && <Button type="button" variant="ghost" size="sm" onClick={() => void query.refetch()}>Retry schema</Button>}
                {descriptor && <ToolSchema tool={descriptor} />}
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
                  <input type="checkbox" className="h-4 w-4 rounded border-border-strong accent-[var(--primary)]" checked={ref.requireApproval ?? false} onChange={(event) => onChange({ tools: refs.map((existing, row) => row === index ? { ...existing, requireApproval: event.target.checked } : existing) })} />
                  Require approval before each call
                </label>
              </div>
            );
          })}
        </div>
      )}
      {refs.some((ref) => ref.requireApproval) && <p className="form-hint">Approval waits are in-process, not durable. Use inline execution; worker/API splits and process restarts cannot preserve pending approvals.</p>}
      {fieldErrors.tools && <p className="text-xs text-destructive">{fieldErrors.tools}</p>}

      <div className="space-y-2">
        <Label>Canvas tool declarations</Label>
        <p className="form-hint">Create and configure a tool node on the canvas without edges, then select it here. Attachment does not detach or execute that node as a workflow step.</p>
        {!graph && <p className="text-xs text-destructive">Canvas topology is unavailable. Built-in attachment is disabled.</p>}
        {graph && toolNodes.length === 0 && <p className="form-hint">No tool declarations on this canvas yet.</p>}
        {toolNodes.map((node) => {
          const ref: AgentToolReference = { kind: "node", nodeId: node.id };
          const checked = refs.some((existing) => toolKey(existing) === toolKey(ref));
          const issue = nodeIssue(node.id);
          return (
            <label key={node.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-input px-3 py-2.5">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50" checked={checked} disabled={Boolean(issue) && !checked} onChange={(event) => toggle(ref, event.target.checked)} />
              <span className="min-w-0">
                <span className="block break-all text-sm">{node.data.label}</span>
                <span className="block break-all text-xs text-muted">{node.data.toolType} · {node.id}</span>
                {issue && <span className="mt-1 block text-xs text-muted">{issue}</span>}
              </span>
            </label>
          );
        })}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-mcp`}>MCP credential</Label>
        <Select value={credentialId || "__none__"} onValueChange={(value) => { setCredentialId(value === "__none__" ? "" : value); refresh.reset(); }}>
          <SelectTrigger id={`${id}-mcp`} className="w-full"><SelectValue placeholder="Choose an MCP server" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Choose an MCP server</SelectItem>
            {mcpCredentials.map((credential) => <SelectItem key={credential.id} value={credential.id}>{credential.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {credentials.isPending && <p className="form-hint">Loading MCP credentials…</p>}
        {credentials.isError && <p className="text-xs text-destructive">Could not load credentials. <button type="button" className="focus-ring rounded-sm underline" onClick={() => void credentials.refetch()}>Retry</button></p>}
        {credentials.isSuccess && mcpCredentials.length === 0 && <p className="form-hint">Add an MCP server in <Link href="/settings#settings-mcp" className="underline underline-offset-2">Settings → MCP servers</Link>.</p>}
        {credentialId && !selectedCredential && credentials.isSuccess && <p className="text-xs text-destructive">Selected MCP credential no longer exists. Choose another server.</p>}
        {selectedCredential && (
          <div className="space-y-2 rounded-lg border border-border px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted">Cached discovery</p>
              <Button type="button" variant="ghost" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate(credentialId)}>
                <RefreshCw className="mr-1.5 h-3 w-3" />{refresh.isPending ? "Discovering…" : "Refresh tools"}
              </Button>
            </div>
            {selectedQuery?.isPending && <p className="form-hint">Loading discovered tools…</p>}
            {selectedQuery?.isError && <p className="text-xs text-destructive">Could not load discovered tools. <button type="button" className="focus-ring rounded-sm underline" onClick={() => void selectedQuery.refetch()}>Retry</button></p>}
            {refresh.isError && refresh.variables === credentialId && <p className="text-xs text-destructive">Discovery failed. Check the server credential in Settings and retry. Cached tools remain unchanged.</p>}
            {selectedQuery?.data?.discovered_at && <p className="break-all text-2xs text-subtle">Discovered {selectedQuery.data.discovered_at}</p>}
            {selectedQuery?.isSuccess && selectedQuery.data.tools.length === 0 && <p className="form-hint">No cached tools. Refresh tools to discover what this server exposes.</p>}
            {selectedQuery?.data?.tools.map((tool) => {
              const ref: AgentToolReference = { kind: "mcp", credentialId, toolName: tool.name };
              return (
                <div key={tool.name} className="rounded-md border border-border bg-surface-input px-2.5 py-2">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--primary)]" checked={refs.some((existing) => toolKey(existing) === toolKey(ref))} onChange={(event) => toggle(ref, event.target.checked)} />
                    <span className="min-w-0"><span className="block break-all font-mono text-xs">{tool.name}</span>{tool.description && <span className="mt-1 block text-xs text-muted">{tool.description}</span>}</span>
                  </label>
                  <ToolSchema tool={tool} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${id}-iterations`}>Max tool rounds</Label>
          <Input id={`${id}-iterations`} type="number" min={1} step={1} value={data.maxToolIterations ?? ""} placeholder="8" onChange={(event) => updateBound("maxToolIterations", event.target.value)} />
          {fieldErrors.maxToolIterations && <p className="text-xs text-destructive">{fieldErrors.maxToolIterations}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-budget`}>Token budget</Label>
          <Input id={`${id}-budget`} type="number" min={1} step={1} value={data.tokenBudget ?? ""} placeholder="8192" onChange={(event) => updateBound("tokenBudget", event.target.value)} />
          {fieldErrors.tokenBudget && <p className="text-xs text-destructive">{fieldErrors.tokenBudget}</p>}
        </div>
      </div>
      <p className="form-hint">With tools attached, defaults are 8 model responses containing tool calls (a parallel batch counts as one round) and 8192 reported prompt, completion and thinking tokens across all model calls, including Google Search and retries. Limits fail the node through its error route and stop further tool calls.</p>
      {refs.length > 0 && <p className="form-hint">Retries stop once a tool begins to prevent duplicate side effects. The node timeout pauses during approval waits.</p>}
    </InspectorSection>
  );
}
