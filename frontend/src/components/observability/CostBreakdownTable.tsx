"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCostUsd } from "@/lib/format";

type CellValue = string | number;

/** How the column footer summarizes its column across all rows. */
type AggregateKind = "sum" | "sumCost";

export interface CostBreakdownColumn {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Braintrust-style footer aggregate. Omit for no footer total. */
  aggregate?: AggregateKind;
  /** Render non-zero numeric values in the destructive hue (e.g. failed). */
  status?: boolean;
}

export interface CostBreakdownRow {
  id: string;
  /** Optional category color var — drawn as a <=2px left rule only. */
  accentVar?: string;
  cells: Record<string, CellValue>;
}

interface CostBreakdownTableProps {
  columns: CostBreakdownColumn[];
  rows: CostBreakdownRow[];
  /** Accessible table name. */
  "aria-label": string;
  className?: string;
}

function formatCell(
  value: CellValue,
  col: CostBreakdownColumn
): { text: string; danger: boolean } {
  if (typeof value === "string") return { text: value, danger: false };
  if (col.aggregate === "sumCost") return { text: formatCostUsd(value), danger: false };
  const danger = Boolean(col.status) && value > 0;
  return { text: value.toLocaleString(), danger };
}

/**
 * Braintrust-style aggregate table: mono/tabular numeric columns, a hairline
 * header row, and a footer that sums the flagged columns. The only chroma is an
 * optional <=2px category rule per row and status hue on flagged non-zero cells.
 */
export function CostBreakdownTable({
  columns,
  rows,
  "aria-label": ariaLabel,
  className,
}: CostBreakdownTableProps) {
  const totals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const col of columns) {
      if (!col.aggregate) continue;
      acc[col.key] = rows.reduce((sum, row) => {
        const v = row.cells[col.key];
        return sum + (typeof v === "number" ? v : 0);
      }, 0);
    }
    return acc;
  }, [columns, rows]);

  const hasFooter = columns.some((c) => c.aggregate);
  const hasAccent = rows.some((r) => r.accentVar);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted">No data in the selected window.</p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table
        aria-label={ariaLabel}
        className="w-full border-collapse text-sm"
      >
        <thead>
          <tr className="border-b border-border">
            {hasAccent && <th className="w-0.5 p-0" aria-hidden />}
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-4 py-2 font-mono text-2xs font-medium uppercase tracking-wide text-subtle",
                  col.align === "right" ? "text-right" : "text-left"
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="transition-colors duration-fast hover:bg-surface-hover">
              {hasAccent && (
                <td className="w-0.5 p-0">
                  {row.accentVar && (
                    <span
                      className="block h-full w-0.5"
                      style={{ backgroundColor: row.accentVar }}
                      aria-hidden
                    />
                  )}
                </td>
              )}
              {columns.map((col) => {
                const { text, danger } = formatCell(row.cells[col.key], col);
                const isName = col.align !== "right";
                return (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-2",
                      col.align === "right"
                        ? "text-right font-mono tabular-nums"
                        : "text-left",
                      isName ? "text-foreground" : "text-muted",
                      danger && "text-destructive"
                    )}
                  >
                    {isName ? (
                      <span className="block truncate font-medium">{text}</span>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {hasFooter && (
          <tfoot>
            <tr className="border-t border-border bg-surface-input/40">
              {hasAccent && <td className="w-0.5 p-0" aria-hidden />}
              {columns.map((col, idx) => {
                const isFirst = idx === 0;
                if (!col.aggregate) {
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-2 font-mono text-2xs uppercase tracking-wide text-subtle",
                        col.align === "right" ? "text-right" : "text-left"
                      )}
                    >
                      {isFirst ? "Total" : ""}
                    </td>
                  );
                }
                const total = totals[col.key] ?? 0;
                const text =
                  col.aggregate === "sumCost"
                    ? formatCostUsd(total)
                    : total.toLocaleString();
                return (
                  <td
                    key={col.key}
                    className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-foreground"
                  >
                    {text}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
