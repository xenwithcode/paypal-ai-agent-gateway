// app/(app)/activity/JsonGrid.tsx
"use client";

import { useMemo } from "react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { JSON_COL_DEF, columnDefsFor } from "@/lib/gridColumns";

// AG Grid is modular: a grid only works with the modules it declares. The
// Overview grid registers the same set, and registration is idempotent — but
// this page never imports that component, so its registration would not have
// run here. Each entry point declares what it uses rather than relying on
// something else having loaded first.
ModuleRegistry.registerModules([AllCommunityModule]);

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
export default function JsonGrid({ rows, label }: { rows: object[]; label: string }) {
  const columnDefs = useMemo(() => columnDefsFor(rows), [rows]);

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
        theme={themeQuartz}
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
      />
    </div>
  );
}
