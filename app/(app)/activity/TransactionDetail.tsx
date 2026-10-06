// app/(app)/activity/TransactionDetail.tsx
"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { flattenRecord, type DetailNode } from "@/lib/gridColumns";

/**
 * One transaction, read top to bottom.
 *
 * The grid is built for scanning many records; it is bad at reading one. Past
 * a dozen columns the header scrolls away from the cell under it and a reader
 * stops knowing what they are looking at — which is the complaint this
 * answers, and it is a real one rather than a taste.
 *
 * Transposing the whole table was the other option, and it is the right shape
 * for two records: fields down the side, transactions across. It stops working
 * at twenty, because twenty value columns need the same horizontal room the
 * table already had. Reading a single record has no such limit, and it keeps
 * sorting and filtering where they earn their keep — on the grid, over many.
 *
 * What it shows comes from `flattenRecord`, which applies the same rules the
 * columns do: navigation links are skipped, a section left empty here is left
 * out rather than rendered as blank, and only fields this record actually
 * carries appear. Those rules live next to the column builder for the same
 * reason — two copies of "what counts as content" is two copies to keep
 * agreeing.
 *
 * Nested blocks rather than a table, deliberately: what a screen reader gets
 * here is label and value in reading order, one after the other — the thing a
 * 46-column grid cannot give it.
 */
function Nodes({ nodes, depth }: { nodes: DetailNode[]; depth: number }) {
  return (
    <div className={depth > 0 ? "mt-1 border-l border-slate-200 pl-3" : ""}>
      {nodes.map((node) =>
        node.kind === "group" ? (
          <div key={node.key} className="mt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {node.key}
            </p>
            <Nodes nodes={node.children} depth={depth + 1} />
          </div>
        ) : (
          <div key={node.key} className="flex gap-3 py-0.5">
            <span className="w-40 shrink-0 text-xs text-slate-500">{node.key}</span>
            <span className="min-w-0 break-all font-mono text-xs font-medium text-slate-800">
              {node.value}
            </span>
          </div>
        )
      )}
    </div>
  );
}

export default function TransactionDetail({
  record,
  title,
  onClose,
}: {
  record: Record<string, unknown>;
  /** What to call this record in the panel's heading. */
  title: string;
  onClose: () => void;
}) {
  // Memoised because the grid re-renders this panel whenever anything around
  // it changes, and walking a record is work that does not change until the
  // record does.
  const nodes = useMemo(() => flattenRecord(record), [record]);

  return (
    <section
      aria-label={`Details of ${title}`}
      className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold text-slate-700">{title}</h3>
          <p className="text-[11px] text-slate-400">
            Read top to bottom — only the fields this record actually carries.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-500 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Close these details"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 max-h-80 overflow-y-auto pr-1">
        <Nodes nodes={nodes} depth={0} />
      </div>
    </section>
  );
}
