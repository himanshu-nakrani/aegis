"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";

import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function WorkflowNameEditor({
  workflowId,
  name,
  onRenamed,
}: {
  workflowId: string;
  name: string;
  onRenamed: (name: string) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  const mutation = useMutation({
    mutationFn: (nextName: string) =>
      api.updateWorkflow(workflowId, { name: nextName }),
    onSuccess: (_data, nextName) => {
      toast.success("Workflow renamed");
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflow(workflowId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows });
      onRenamed(nextName);
      setEditing(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to rename workflow"
      );
      setValue(name);
      setEditing(false);
    },
  });

  function startEditing() {
    setValue(name);
    setEditing(true);
    // Focus + select after the input mounts.
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function commit() {
    // Enter commits and disables the input, which fires blur → a second commit.
    // Bail if a rename is already in flight to avoid a duplicate PATCH.
    if (mutation.isPending) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      // Empty or unchanged → cancel silently.
      setValue(name);
      setEditing(false);
      return;
    }
    mutation.mutate(trimmed);
  }

  function cancel() {
    setValue(name);
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        autoFocus
        value={value}
        disabled={mutation.isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label="Workflow name"
        className="h-8 max-w-[16rem] text-sm"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title="Rename workflow"
      className={cn(
        "focus-ring group inline-flex min-w-0 max-w-[16rem] items-center gap-1.5 rounded-md px-1 py-0.5 text-left",
        "text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
      )}
    >
      <span className="truncate">{name}</span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100" />
    </button>
  );
}
