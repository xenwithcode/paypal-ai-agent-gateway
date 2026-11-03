// app/(app)/activity/JsonGrid.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ColGroupDef, GridApi } from "ag-grid-community";
import { Search } from "lucide-react";
import { JSON_COL_DEF, columnDefsFor } from "@/lib/gridColumns";
// Registration, licence and palette, shared with the Overview grid. This page
// never imports that component, so the registration would not have run here —
// each entry point declares what it uses rather than relying on something
// else having loaded first, which is why this import exists at all.
import { gridTheme } from "@/lib/grid/setup";

/**
 * Whether the reader may click to open a row, or whether this component decides.
 *
 * Off: a click only ever means what the caller's `onRowClicked` says it means,
 * so the highlighted row and the panel below it cannot disagree — they are the
 * same piece of state, held once, in React.
 */
const ROW_SELECTION = {
  mode: "singleRow",
  checkboxes: false,
  enableClickSelection: false,
} as const;

/**
 * Bring the columns the caller named to the left edge.
 *
 * They stay the columns they were — same id, same header, same place in the
 * order — and only gain a side, because a pinned column is still read in the
 * order the caller asked for. The caller names the *first* columns of its lead
 * list, so pinning moves nothing: the left edge is where they already were.
 */
function withPinned(
  columns: (ColDef | ColGroupDef)[],
  pinned: readonly string[]
): (ColDef | ColGroupDef)[] {
  if (pinned.length === 0) return columns;
  const wanted = new Set(pinned);
  return columns.map((column) => {
    if ("children" in column && column.children) {
      return { ...column, children: withPinned(column.children, pinned) };
    }
    const leaf = column as ColDef;
    return wanted.has(leaf.colId ?? "") ? { ...leaf, pinned: "left" as const } : column;
  });
}

/**
 * A grid for records nobody here wrote the schema for.
 *
 * The columns come from the data rather than from a hand-written list, which
 * is the only approach that survives a response whose sections differ from row
 * to row — see `lib/gridColumns.ts` for the rules it applies and why.
 *
 * Sized to its contents rather than to a fixed height: this sits inside a page
 * of sections, and a grid that scrolled inside its own box would hide rows the
 * reader has no other way to reach. Twenty records is well inside what that
 * costs.
 */
export default function JsonGrid({
  rows,
  label,
  lead,
  pinned = [],
  selected = null,
  onRowClicked,
}: {
  rows: object[];
  label: string;
  /**
   * What to bring to the front, most important first. Passed through rather
   * than decided here: this component knows nothing about what the table is
   * for, and a default order is still an opinion about it.
   */
  lead?: readonly string[];
  /**
   * What stays on screen while the rest scrolls past — by column id, and
   * always the first columns of `lead`. The grid is wider than any screen it
   * will ever be given (forty-one columns from a response nobody wrote), and
   * scrolling away from *when* and *how much* would leave the reader with
   * identifiers and no money.
   */
  pinned?: readonly string[];
  /**
   * Which record is open. The grid is for scanning many records; reading one
   * is the detail panel's job, and this is how the grid learns which one —
   * and how it marks the row the panel is talking about.
   */
  selected?: object | null;
  /**
   * Which record was picked. The grid is for scanning many records; reading
   * one is the detail panel's job, and this is how it learns which one.
   */
  onRowClicked?: (record: object) => void;
}) {
  // `lead` is a dependency because a different order is different columns. The
  // callers keep theirs at module scope so the reference is stable — an inline
  // array would rebuild every column on every render.
  const columnDefs = useMemo(
    () => withPinned(columnDefsFor(rows, { lead }), pinned),
    [rows, lead, pinned]
  );

  const apiRef = useRef<GridApi | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(rows.length);

  // A new dataset is a new answer to "how many am I looking at": the filter
  // text survives a re-fetch, but what it matched does not.
  useEffect(() => {
    setShown(rows.length);
  }, [rows]);

  // The one row the detail panel is talking about, marked here rather than
  // derived: the grid has to agree with the panel, and this is the only place
  // both can be told.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.deselectAll();
    if (!selected) return;
    api.forEachNode((node) => {
      if (node.data === selected) node.setSelected(true);
    });
  }, [selected, rows]);

  return (
    <>
      {/* Search, not forty-one filters: the question a reader brings to a
          ledger is "find the one about X", and one box answers it across every
          field the response carried. The count beside it says what the box
          did — a filtered grid that looks like the whole month is a quieter
          lie than an empty one. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-slate-400" aria-live="polite">
          {shown === rows.length
            ? `${rows.length} record${rows.length === 1 ? "" : "s"}`
            : `${shown} of ${rows.length} records`}
        </p>
        <label className="relative block">
          <span className="sr-only">Search these records</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              apiRef.current?.setGridOption("quickFilterText", event.target.value);
            }}
            placeholder="Search these records…"
            className="w-56 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>

      {/* The region is named for the screen reader: a grid of unlabelled cells is
          a table nobody has said the purpose of. */}
      <div
        role="region"
        aria-label={label}
        className="ag-theme-quartz w-full overflow-x-auto rounded-xl border border-slate-200"
      >
        <AgGridReact
          rowData={rows}
          columnDefs={columnDefs}
          // The shared settings, minus the per-column filters: with a search
          // box over every field, a funnel on each of forty-one headers is
          // noise with a handle on it.
          defaultColDef={{ ...JSON_COL_DEF, filter: false }}
          theme={gridTheme}
          rowClass="cursor-pointer"
          rowSelection={ROW_SELECTION}
          onGridReady={(event) => {
            apiRef.current = event.api;
          }}
          onFilterChanged={() => {
            setShown(apiRef.current?.getDisplayedRowCount() ?? rows.length);
          }}
          // Fit the columns to what is in them. PayPal's fields vary in width by
          // an order of magnitude (`transactionId` against `value`), and a fixed
          // guess leaves one clipped and the other mostly empty.
          autoSizeStrategy={{ type: "fitCellContents" }}
          // With autoHeight the grid shows every row it has, so virtualising the
          // columns would blank the ones scrolled out of view while the page
          // believes they are on screen.
          suppressColumnVirtualisation
          domLayout="autoHeight"
          tooltipShowDelay={300}
          // Any cell in the row: asking a reader to hit a specific column to
          // open details would be a rule they have to learn for no benefit.
          onRowClicked={(event) => {
            if (event.data) onRowClicked?.(event.data as object);
          }}
        />
      </div>
    </>
  );
}
