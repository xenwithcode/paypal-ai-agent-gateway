// app/(app)/activity/JsonGrid.tsx
"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { JSON_COL_DEF, columnDefsFor } from "@/lib/gridColumns";
// Registration, licence and palette, shared with the Overview grid. This page
// never imports that component, so the registration would not have run here —
// each entry point declares what it uses rather than relying on something
// else having loaded first, which is why this import exists at all.
import { gridTheme } from "@/lib/grid/setup";

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
   * Which record was picked. The grid is for scanning many records; reading
   * one is the detail panel's job, and this is how it learns which one.
   */
  onRowClicked?: (record: object) => void;
}) {
  // `lead` is a dependency because a different order is different columns. The
  // callers keep theirs at module scope so the reference is stable — an inline
  // array would rebuild every column on every render.
  const columnDefs = useMemo(() => columnDefsFor(rows, { lead }), [rows, lead]);

  return (
    // The region is named for the screen reader: a grid of unlabelled cells is
    // a table nobody has said the purpose of.
    <div
      role="region"
      aria-label={label}
      className="ag-theme-quartz w-full overflow-x-auto rounded-xl border border-slate-200"
    >
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={JSON_COL_DEF}
        theme={gridTheme}
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
  );
}
