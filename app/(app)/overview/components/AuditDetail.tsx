// app/(app)/overview/components/AuditDetail.tsx
//
// The grid inside the grid: expand an order and read its own bitácora.
//
// This is the one feature in the product that needs AG Grid Enterprise, so
// everything here is data and configuration rather than a component: the
// parent spreads it into the grid **only when Enterprise modules are
// registered** (`ENTERPRISE_GRID`), and with no key the grid is exactly what
// it was before — no half-configured expansion, no banner, no apology.
"use client";

import type { ColDef, GridOptions } from "ag-grid-community";
import { auditTrailFor, type AuditRow } from "@/lib/auditTrail";
import { gridTheme } from "@/lib/grid/setup";
import type { PolicyRow } from "../types";

/** Rejected, so it reads as rejected and not merely as grey. */
function ValueCell(params: { value?: unknown; data?: AuditRow }) {
  const rejected = params.data?.state === "rejected";
  return (
    <span className={rejected ? "text-slate-400 line-through" : "text-slate-700"}>
      {String(params.value ?? "")}
    </span>
  );
}

function StateCell(params: { data?: AuditRow }) {
  const state = params.data?.state;
  if (!state) return null;
  const look =
    state === "chosen"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : state === "proposed"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-slate-300 bg-slate-50 text-slate-500";
  const label = state === "chosen" ? "Chosen" : state === "proposed" ? "Proposed" : "Rejected";
  return (
    <span
      title={
        state === "chosen"
          ? "The human took this one."
          : state === "proposed"
            ? "The agent would have taken this one; the human took something else."
            : "Offered by the search and not taken."
      }
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${look}`}
    >
      {label}
    </span>
  );
}

const COLUMN_DEFS: ColDef<AuditRow>[] = [
  {
    field: "field",
    headerName: "Field",
    minWidth: 130,
    flex: 1,
    cellClass: "text-xs font-semibold text-slate-600",
  },
  {
    field: "value",
    headerName: "Value",
    minWidth: 220,
    flex: 2.4,
    cellRenderer: ValueCell,
    // Figures and ids in mono, prose in the system face — the same split the
    // rest of the product uses, so a number looks like one everywhere.
    cellClass: ({ data }) => (data?.mono ? "font-mono text-xs text-slate-800" : "text-xs"),
  },
  {
    field: "state",
    headerName: "Choice",
    minWidth: 90,
    maxWidth: 110,
    cellRenderer: StateCell,
  },
];

/**
 * The detail grid's own options.
 *
 * A small table on purpose: the parent grid answers *what is on the table*,
 * and this answers *what is in this one* — read top to bottom, no sorting, no
 * filtering. A reader who has to sort an audit trail has already lost it.
 */
export const AUDIT_DETAIL_GRID_OPTIONS: GridOptions<AuditRow> = {
  columnDefs: COLUMN_DEFS,
  defaultColDef: { sortable: false, filter: false, resizable: true },
  domLayout: "autoHeight",
  headerHeight: 36,
  rowHeight: 40,
  theme: gridTheme,
  // The trail is a record, not a workspace: nothing here is editable, and a
  // cell editor on an audit trail would be a way to rewrite history.
  suppressCellFocus: true,
};

/**
 * What the expansion shows for one order.
 *
 * The contract is the part that cost the most to find, so it is written down:
 * in v36 `getDetailRowData` **does not return rows** — it receives
 * `{ node, successCallback }` and has to *call back* with them. Returning an
 * array compiles, type-checks, and renders an empty grid under its own
 * headers for ever. `rowData` is accepted too, for the React renderer, but
 * the callback is the path that actually fills the grid.
 */
export function auditDetailParams(params: { data?: PolicyRow }): {
  detailGridOptions: GridOptions<AuditRow>;
  getDetailRowData: (request: {
    node?: { data?: PolicyRow } | null;
    successCallback: (rows: AuditRow[]) => void;
  }) => void;
} {
  return {
    // The detail grid's options travel *with the renderer*, not at the grid
    // level: `detailGridOptions` is not a `gridOptions` property (AG Grid
    // #307 says so, and it names the mistake).
    detailGridOptions: AUDIT_DETAIL_GRID_OPTIONS,
    // Read the node when there is one — its data can have changed since the
    // params were built — and fall back to the params' own row.
    getDetailRowData: ({ node, successCallback }) => {
      successCallback(auditTrailFor((node?.data ?? params.data ?? {}) as PolicyRow));
    },
  };
}
