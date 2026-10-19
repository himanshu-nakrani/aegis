"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatFullTimestamp } from "@/lib/format-date";
import { queryKeys } from "@/lib/query-keys";
import type { Credential, MCPServerConfig } from "@/types/workflow";

// Do not render arbitrary transport/validation responses: they can contain
// submitted secrets or output from a user-controlled MCP server.
function mcpErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("mcp_stdio_enabled") || (message.includes("stdio") && message.includes("disabled"))) {
    return "Stdio is disabled on this deployment. Ask an administrator to enable MCP_STDIO_ENABLED only for trusted server commands.";
  }
  if (message.includes("app_encryption_key") || message.includes("encryption")) {
    return "This server contains secrets. An administrator must configure APP_ENCRYPTION_KEY before it can be saved.";
  }
  if (message.includes("mcp_allowed_hosts") || message.includes("private") || message.includes("allowlist")) {
    return "This server host is not permitted. Private or local hosts require an exact administrator entry in MCP_ALLOWED_HOSTS.";
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "The MCP server did not respond in time. Check that it is running and reachable, then refresh tools.";
  }
  if (message.includes("401") || message.includes("403") || message.includes("unauthorized") || message.includes("forbidden") || message.includes("authentication")) {
    return "Access was denied. Check your Aegis permissions and the MCP server authentication headers.";
  }
  if (message.includes("404") || message.includes("not found")) {
    return "The server credential is unavailable or the MCP endpoint was not found. Reload the list and check the endpoint.";
  }
  if (message.includes("connect") || message.includes("transport") || message.includes("protocol") || message.includes("mcp discovery")) {
    return "Could not connect to this MCP server. Check its transport, endpoint or command, and authentication; then refresh tools.";
  }
  return fallback;
}

function parseStringMap(text: string, label: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be a valid JSON object.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.entries(parsed).some(([key, value]) => !key.trim() || typeof value !== "string")) {
    throw new Error(`${label} must be a JSON object with nonempty keys and string values.`);
  }
  return parsed as Record<string, string>;
}

function SecretJSONField({ id, label, value, onChange, disabled }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label} (JSON object)</Label>
        <Button type="button" variant="ghost" size="sm" disabled={disabled}
          aria-pressed={visible} aria-controls={id} onClick={() => setVisible(!visible)}>
          {visible ? "Hide values" : "Show values"}
        </Button>
      </div>
      {visible ? (
        <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)}
          disabled={disabled} autoComplete="off" spellCheck={false} className="font-mono text-xs" aria-describedby={`${id}-hint`} />
      ) : (
        <Input id={id} type="password" value={value} readOnly disabled={disabled} autoComplete="new-password" aria-describedby={`${id}-hint`} />
      )}
      <p id={`${id}-hint`} className="text-xs text-muted">
        String values only. Hidden by default; reveal to edit. Secrets require backend encryption and are never returned after saving.
      </p>
    </div>
  );
}

function MCPServerForm() {
  const queryClient = useQueryClient();
  const id = useId();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<MCPServerConfig["transport"]>("streamable_http");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("[]");
  const [secrets, setSecrets] = useState("{}");
  const [trusted, setTrusted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setError(null);
    try {
      if (!name.trim()) throw new Error("Server name is required.");
      let config: MCPServerConfig;
      if (transport === "streamable_http") {
        let endpoint: URL;
        try { endpoint = new URL(url.trim()); } catch { throw new Error("Enter a valid absolute HTTP or HTTPS MCP endpoint."); }
        if (!["http:", "https:"].includes(endpoint.protocol)) throw new Error("The endpoint must use HTTP or HTTPS.");
        if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
          throw new Error("Do not put credentials, query parameters, or fragments in the server URL. Use authentication headers instead.");
        }
        config = { transport, url: url.trim(), headers: parseStringMap(secrets, "Headers") };
      } else {
        if (!command.trim()) throw new Error("Server command is required.");
        if (!trusted) throw new Error("Confirm that you trust this command before adding a stdio server.");
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(args); } catch { throw new Error("Arguments must be a valid JSON array of strings."); }
        if (!Array.isArray(parsedArgs) || parsedArgs.some((value) => typeof value !== "string")) {
          throw new Error("Arguments must be a JSON array of strings.");
        }
        config = { transport, command: command.trim(), args: parsedArgs as string[], env: parseStringMap(secrets, "Environment") };
      }
      // A mutation would retain its config variables in TanStack's mutation
      // cache. Send secrets directly and retain only the masked list response.
      setSaving(true);
      try {
        await api.createCredential({ name: name.trim(), type: "mcp", config });
        setName("");
        setUrl("");
        setCommand("");
        setArgs("[]");
        setSecrets("{}");
        setTrusted(false);
        await queryClient.invalidateQueries({ queryKey: queryKeys.credentials });
        toast.success("MCP server saved. Refresh tools to connect and discover its capabilities.");
      } catch (failure) {
        setError(mcpErrorMessage(failure, "Could not save this MCP server. Check the configuration and your permissions, then try again."));
      } finally {
        setSaving(false);
      }
    } catch (failure) {
      // Only local, fixed validation messages are displayed here.
      setError(failure instanceof Error ? failure.message : "Check the server configuration.");
    }
  };

  return (
    <form className="space-y-4 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <div>
        <h3 className="text-sm font-medium text-foreground">Add MCP server</h3>
        <p className="mt-1 text-xs text-muted">Saved as a named MCP credential, shared with the Credentials page. Agents bind servers by credential ID.</p>
      </div>
      <fieldset disabled={saving} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`} required>Name</Label>
            <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-transport`}>Transport</Label>
            <Select value={transport} disabled={saving} onValueChange={(value) => {
              setTransport(value as MCPServerConfig["transport"]); setSecrets("{}"); setTrusted(false); setError(null);
            }}>
              <SelectTrigger id={`${id}-transport`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable_http">Streamable HTTP</SelectItem>
                <SelectItem value="stdio">Stdio (trusted host command)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {transport === "streamable_http" ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-url`} required>MCP endpoint URL</Label>
            <Input id={`${id}-url`} type="url" value={url} onChange={(event) => setUrl(event.target.value)} autoComplete="off" aria-describedby={`${id}-url-hint`} />
            <p id={`${id}-url-hint`} className="text-xs text-muted">Use the full Streamable HTTP endpoint. Keep tokens in headers, never the URL. Local/private hosts require an exact administrator MCP_ALLOWED_HOSTS entry.</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-foreground">
              <p className="font-medium">Stdio executes code on the backend host.</p>
              <p className="mt-1 text-muted">Only run commands you trust. The deployment must explicitly enable MCP_STDIO_ENABLED; it is disabled by default.</p>
              <label className="mt-3 flex items-start gap-2">
                <input type="checkbox" checked={trusted} onChange={(event) => setTrusted(event.target.checked)} className="mt-0.5 accent-primary" />
                <span>I trust this server command and understand that it runs on the backend host.</span>
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-command`} required>Executable command</Label>
              <Input id={`${id}-command`} value={command} onChange={(event) => setCommand(event.target.value)} autoComplete="off" className="font-mono text-xs" />
              <p className="text-xs text-muted">An executable, not a shell command. Supply flags as arguments and secrets as environment variables.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-args`}>Arguments (JSON array)</Label>
              <Textarea id={`${id}-args`} value={args} onChange={(event) => setArgs(event.target.value)} spellCheck={false} className="font-mono text-xs" />
            </div>
          </>
        )}
        <SecretJSONField key={transport} id={`${id}-secrets`} label={transport === "stdio" ? "Environment variables" : "Headers"}
          value={secrets} onChange={setSecrets} disabled={saving} />
      </fieldset>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" aria-hidden />{saving ? "Saving server…" : "Add MCP server"}
      </Button>
    </form>
  );
}

function MCPServerRow({ credential, onDelete }: { credential: Credential; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const tools = useQuery({ queryKey: queryKeys.mcpCredentialTools(credential.id), queryFn: () => api.getMCPCredentialTools(credential.id), retry: false });
  const discover = useMutation({
    mutationFn: () => api.discoverMCPCredential(credential.id),
    onSuccess: async (result) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.mcpCredentialTools(credential.id) });
      queryClient.setQueryData(queryKeys.mcpCredentialTools(credential.id), result);
      toast.success(`Discovered ${result.tools.length} tools`);
    },
  });
  const failure = discover.error || tools.error;
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words text-sm font-medium text-foreground">{credential.name}</p>
            <Badge variant="outline" className="font-mono text-2xs">{credential.config.transport === "stdio" ? "stdio" : "HTTP"}</Badge>
          </div>
          <p className="text-xs text-muted">
            {tools.data?.discovered_at
              ? `Last discovered ${formatFullTimestamp(tools.data.discovered_at)}`
              : "Not discovered yet"}
            {tools.data?.discovered_at &&
              Date.now() - new Date(tools.data.discovered_at).getTime() > 24 * 60 * 60 * 1000 &&
              // P5d: stale cache can bind tools the server no longer exposes.
              " · refresh recommended"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" disabled={discover.isPending || tools.isLoading}
            onClick={() => discover.mutate()} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${discover.isPending ? "animate-spin" : ""}`} aria-hidden />
            {discover.isPending ? "Discovering…" : "Refresh tools"}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={discover.isPending} onClick={onDelete} aria-label={`Delete MCP server ${credential.name}`}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
      {tools.isLoading && <LoadingState variant="list" />}
      {failure && <p role="alert" className="text-xs text-destructive">{mcpErrorMessage(failure, "Could not load MCP tools. Check the server configuration and connection, then refresh tools.")}</p>}
      {tools.data && (
        <details className="rounded-lg border border-border bg-surface-input px-3 py-2">
          <summary className="focus-ring cursor-pointer text-xs font-medium text-foreground">
            {tools.data.tools.length} discovered tools{discover.isPending ? " · refreshing" : ""}
          </summary>
          {tools.data.tools.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{tools.data.discovered_at ? "The server returned no tools." : "Refresh tools to connect to this server."}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {tools.data.tools.map((tool) => (
                <li key={tool.name}>
                  <details className="rounded-md border border-border p-2.5">
                    <summary className="focus-ring cursor-pointer break-words font-mono text-xs text-foreground">{tool.name}</summary>
                    {tool.description && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted">{tool.description}</p>}
                    <p className="mt-3 text-2xs font-medium uppercase tracking-wide text-muted">Input schema</p>
                    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-2xs text-foreground">{JSON.stringify(tool.input_schema, null, 2)}</pre>
                    {tool.output_schema && <>
                      <p className="mt-3 text-2xs font-medium uppercase tracking-wide text-muted">Output schema</p>
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-2xs text-foreground">{JSON.stringify(tool.output_schema, null, 2)}</pre>
                    </>}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </li>
  );
}

/** One credential-backed manager, reused in Settings and Credentials. */
export function MCPServersPanel({ id }: { id?: string }) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const credentials = useQuery({ queryKey: queryKeys.credentials, queryFn: api.listCredentials });
  const servers = credentials.data?.filter((credential) => credential.type === "mcp") || [];
  return (
    <SectionCard id={id} title="MCP servers" description="Register trusted tool servers and discover the tools agents can use.">
      <div className="space-y-4">
        {credentials.isLoading ? <LoadingState variant="list" /> : credentials.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-xs text-destructive">MCP servers could not be loaded. Check API access and retry.</p>
            <Button type="button" size="sm" variant="outline" disabled={credentials.isFetching} onClick={() => void credentials.refetch()}>
              {credentials.isFetching ? "Retrying…" : "Retry"}
            </Button>
          </div>
        ) : servers.length === 0 ? (
          <EmptyState compact icon={Server} title="No MCP servers" description="Add an HTTP endpoint or a trusted stdio command below, then refresh tools." />
        ) : (
          <ul className="divide-y divide-border">
            {servers.map((credential) => <MCPServerRow key={credential.id} credential={credential} onDelete={() => { setDeleteError(null); setDeleteTarget(credential); }} />)}
          </ul>
        )}
        {deleteError && <p role="alert" className="text-xs text-destructive">{deleteError}</p>}
        <MCPServerForm />
      </div>
      <ConfirmDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete MCP server?" description="Agents using this server credential will no longer be able to call its tools. This cannot be undone."
        confirmLabel="Delete MCP server" loadingLabel="Deleting server…" variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await api.deleteCredential(deleteTarget.id);
            queryClient.removeQueries({ queryKey: queryKeys.mcpCredentialTools(deleteTarget.id) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.credentials });
            setDeleteError(null);
            toast.success("MCP server deleted");
          } catch (failure) {
            const message = mcpErrorMessage(failure, "Could not delete this MCP server. Check your permissions and try again.");
            setDeleteError(message);
            toast.error(message);
          }
        }} />
    </SectionCard>
  );
}
