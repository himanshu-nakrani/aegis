"use client";

import { useState } from "react";
import type { Node } from "@xyflow/react";
import { ChevronDown, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRunInput } from "./useRunInput";

interface RunControlProps {
  workflowId: string;
  nodes: Node[];
  isRunning: boolean;
  disabled?: boolean;
  onRun: (inputText: string) => void;
  onStop: () => void;
}

export function RunControl({
  workflowId,
  nodes,
  isRunning,
  disabled = false,
  onRun,
  onStop,
}: RunControlProps) {
  const { fields, values, setValue, freeText, setFreeText, composed, hasStored } =
    useRunInput(workflowId, nodes);
  const [open, setOpen] = useState(false);

  if (isRunning) {
    return (
      <Button
        size="sm"
        variant="destructive"
        className="h-9"
        onClick={onStop}
        aria-label="Stop run"
      >
        <Square className="h-4 w-4" />
        <span className="hidden sm:inline">Stop</span>
      </Button>
    );
  }

  // Run immediately when there is nothing to fill in, or a prior input is
  // already stored; otherwise surface the form so the user sees the fields.
  const canRunImmediately = fields.length === 0 || hasStored;

  const handlePrimary = () => {
    if (canRunImmediately) {
      onRun(composed);
    } else {
      setOpen(true);
    }
  };

  const runFromForm = () => {
    onRun(composed);
    setOpen(false);
  };

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex h-9">
            <Button
              size="sm"
              className="h-9 rounded-r-none"
              disabled
              aria-label="Run workflow"
            >
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Run</span>
            </Button>
            <Button
              size="sm"
              className="h-9 w-7 rounded-l-none border-l border-primary-foreground/20 px-0"
              disabled
              aria-label="Run options"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Add nodes to run</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="inline-flex h-9 shrink-0">
      <Button
        size="sm"
        className="h-9 rounded-r-none"
        onClick={handlePrimary}
        aria-label="Run workflow"
      >
        <Play className="h-4 w-4" />
        <span className="hidden sm:inline">Run</span>
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            className="h-9 w-7 rounded-l-none border-l border-primary-foreground/20 px-0"
            aria-label="Run options"
            aria-expanded={open}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-3">
          {fields.length > 0 ? (
            <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-0.5">
              {fields.map((field) => {
                const id = `run-field-${field.key}`;
                const value = values[field.key] ?? "";
                return (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={id} required={field.required}>
                      {field.key}
                    </Label>
                    {field.type === "boolean" ? (
                      <Select
                        value={value === "true" ? "true" : "false"}
                        onValueChange={(v) => setValue(field.key, v)}
                      >
                        <SelectTrigger id={id} size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">true</SelectItem>
                          <SelectItem value="false">false</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={id}
                        type={field.type === "number" ? "number" : "text"}
                        value={value}
                        onChange={(e) => setValue(field.key, e.target.value)}
                        placeholder={field.type === "number" ? "0" : field.key}
                        className="h-8 font-mono text-xs"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="run-free-text">Input</Label>
              <Textarea
                id="run-free-text"
                rows={3}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Workflow input…"
                className="font-mono text-xs"
              />
            </div>
          )}
          <div className="flex justify-end border-t border-border pt-2.5">
            <Button size="sm" className="h-8" onClick={runFromForm}>
              <Play className="h-3.5 w-3.5" />
              Run
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
