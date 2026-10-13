// app/(app)/crowdfunding/ProjectGrid.tsx
"use client";

import { useMemo } from "react";
import Image from "next/image";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
// Registration, licence and palette, shared with every other grid in the app.
// This page never imports Overview or Activity, so the registration would not
// have run here — each entry point declares what it uses.
import { gridTheme } from "@/lib/grid/setup";
import { daysLeft, statusOf, type Project, type Risk } from "@/lib/crowdfunding";
import ProgressCell from "./ProgressCell";

/**
 * The showcase as a table rather than as cards.
 *
 * A catalogue of four projects reads beautifully as cards and stops reading at
 * forty: sorting by return, filtering to grade A and scanning a column of bars
 * are things a grid does and a card wall does not. The row carries the four
 * sentences the design asks for — what it is for, how close it is, what it
 * pays, what stands behind it, and how many people are already in — and
 * clicking anywhere on it selects it, because asking a reader to hit a
 * particular column before they may look is a rule they would have to learn
 * for no benefit.
 *
 * Demo rows say so on the row itself. The seed is honest data about projects
 * that have not been audited, and a chip costs less space than the doubt it
 * removes.
 */

/** The committee's grade, coloured — and the words that explain it. */
const RISK_STYLE: Record<Risk, string> = {
  A: "border-emerald-300 bg-emerald-50 text-emerald-700",
  B: "border-blue-200 bg-blue-50 text-blue-700",
  C: "border-amber-300 bg-amber-50 text-amber-700",
};

/** The name, the city and what the money is for — three lines of one cell. */
function NameCell(params: { data?: Project }) {
  const project = params.data;
  if (!project) return <span>{String(project ?? "")}</span>;

  return (
    <span className="flex h-full min-w-0 items-center gap-2 px-1 py-1">
      {/* The project, drawn: an investor buys with their eyes, and the
          illustration ships with the repo — local, labelled, never a
          photograph of a business that has not been audited. */}
      {project.image && (
        <Image
          src={project.image}
          alt=""
          width={36}
          height={36}
          unoptimized
          className="h-9 w-9 shrink-0 rounded-lg border border-slate-100 object-cover"
        />
      )}
      <span className="flex min-w-0 flex-col justify-center gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-slate-900">{project.name}</span>
          {project.seed && (
            <span className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
              demo
            </span>
          )}
        </span>
        <span className="truncate text-[11px] leading-tight text-slate-400">
          {project.city} · {project.what}
        </span>
      </span>
    </span>
  );
}

/** The grade as a chip, and the collateral spelled out beside it. */
function RiskCell(params: { data?: Project }) {
  const project = params.data;
  if (!project) return null;

  return (
    <span
      className="flex h-full items-center gap-2 px-1"
      title={`Grade ${project.risk} — backed by ${project.collateral.toLowerCase()}. The grade is the risk committee's, and the backing is what would be liquidated if the business failed.`}
    >
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${RISK_STYLE[project.risk]}`}
      >
        {project.risk}
      </span>
      <span className="truncate text-[12px] text-slate-600">{project.collateral}</span>
    </span>
  );
}

/** The same three colours as the chips, as text — one vocabulary per grade. */
const RISK_TEXT: Record<Risk, string> = {
  A: "text-emerald-700",
  B: "text-blue-700",
  C: "text-amber-700",
};

/** How each grade reads in words, beside its letter. */
const RISK_WORD: Record<Risk, string> = {
  A: "least risky",
  B: "mid risk",
  C: "most risky",
};

/**
 * The price beside the reward.
 *
 * A rate on its own reads as a ranking: 24% beats 14% until you know the first
 * is a grade C campaign and the second a grade A one — and the grade *is* in
 * this table, two columns away, in another format, which a reader comparing
 * returns never reaches. So it travels with the rate: the reward and its price
 * in the cell the eye actually lands on.
 */
function ReturnCell(params: { data?: Project }) {
  const project = params.data;
  if (!project) return <span>—</span>;

  return (
    <span
      className="flex h-full min-w-0 flex-col justify-center gap-0.5 px-1"
      title={`${project.returnPct}% a year. The return is the price of the risk: grade ${project.risk} is ${RISK_WORD[project.risk]}, backed by ${project.collateral.toLowerCase()}.`}
    >
      <span className="font-mono text-[13px] font-semibold text-emerald-600">
        {project.returnPct}% a year
      </span>
      <span className={`text-[11px] leading-tight ${RISK_TEXT[project.risk]}`}>
        Grade {project.risk} · {RISK_WORD[project.risk]}
      </span>
    </span>
  );
}

export default function ProjectGrid({
  projects,
  onSelected,
}: {
  projects: Project[];
  /** Which row the operator picked — the grid selects, the panel explains. */
  onSelected: (project: Project) => void;
}) {
  // Memoised on the data, not on the callback: the columns do not depend on
  // who is listening, and rebuilding them on every render would re-measure
  // every column in a grid whose whole point is being scannable.
  const columnDefs = useMemo<ColDef<Project>[]>(
    () => [
      {
        headerName: "Project",
        field: "name",
        cellRenderer: NameCell,
        minWidth: 280,
        flex: 1.6,
        // Sorted by nothing on arrival: the seed's order is the order the
        // showcase presents, and a default sort would be an opinion about
        // which project deserves to be seen first.
      },
      {
        headerName: "Funded",
        cellRenderer: ProgressCell,
        minWidth: 250,
        flex: 1.4,
        sortable: false, // The bar is a picture of a number; sorting by the picture is not sorting.
        filter: false,
      },
      {
        headerName: "Return",
        field: "returnPct",
        // Sorted and exported from the number; drawn as two lines. The rate on
        // its own invites a comparison the data cannot support — a reader who
        // compares 14% with 24% is comparing two different promises, and the
        // price of the second one is the grade sitting two columns away. So it
        // travels with the rate: reward and price in the cell the eye lands on.
        valueFormatter: ({ value }) => (typeof value === "number" ? `${value}% a year` : "—"),
        cellRenderer: ReturnCell,
        minWidth: 130,
        maxWidth: 165,
        type: "numericColumn",
      },
      {
        headerName: "Backed by",
        field: "collateral",
        cellRenderer: RiskCell,
        minWidth: 210,
        flex: 1,
      },
      {
        headerName: "Closes",
        field: "deadline",
        // The date sorts lexicographically *and* chronologically — both sides
        // are YYYY-MM-DD — so sorting needs no comparator, and the words say
        // what the date means: a campaign with six days left and one with six
        // months left do not feel the same.
        valueFormatter: ({ value }) => {
          const left = daysLeft(String(value ?? ""));
          if (Number.isNaN(left)) return "—";
          if (left < 0) return "closed";
          if (left === 0) return "today";
          return `in ${left} day${left === 1 ? "" : "s"}`;
        },
        cellClass: ({ value }) => {
          const left = daysLeft(String(value ?? ""));
          if (Number.isNaN(left)) return "";
          if (left < 0) return "text-red-600 font-semibold";
          return left <= 7 ? "text-amber-600 font-semibold" : "text-slate-600";
        },
        minWidth: 100,
        maxWidth: 130,
      },
      {
        headerName: "Investors",
        field: "investors",
        valueFormatter: ({ value }) =>
          typeof value === "number" ? value.toLocaleString("en-US") : "—",
        type: "numericColumn",
        minWidth: 100,
        maxWidth: 130,
      },
    ],
    []
  );

  const defaultColDef = useMemo<ColDef<Project>>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
      cellClass: "text-[13px] text-slate-700 flex items-center",
    }),
    []
  );

  return (
    <div
      role="region"
      aria-label="Projects seeking funding"
      className="ag-theme-quartz w-full overflow-x-auto rounded-xl border border-slate-200"
    >
      <AgGridReact<Project>
        rowData={projects}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        theme={gridTheme}
        getRowId={(params) => params.data.id}
        // One row at a time: this is a choice, not a batch operation, and the
        // selection styling the theme already draws is the only highlight this
        // screen needs. The object form is not style — AG Grid deprecated the
        // bare string at v32.2.1 and prints a warning on every load, and a
        // console that warns on every load is one nobody reads.
        //
        // `enableClickSelection` has to be said out loud with the object form:
        // without it a plain click moves the cursor and not the selection, the
        // panel never opens, and nothing on screen says why.
        rowSelection={{ mode: "singleRow", enableClickSelection: true }}
        // Two-line cells, so the rows are two lines tall. The default row
        // height clips the second one — which would hide the city under the
        // project name and the grade under its rate, and a grade nobody can
        // see is the exact thing this column was changed to show.
        rowHeight={60}
        onSelectionChanged={(event) => {
          const [row] = event.api.getSelectedRows();
          if (row) onSelected(row);
        }}
        // Four to fifty rows: show them all rather than scroll inside a box
        // whose rows the reader has no other way to reach.
        domLayout="autoHeight"
        suppressCellFocus
        tooltipShowDelay={300}
        // A funded project is still shown — it is the proof the bar ends
        // somewhere — but it reads as closed rather than as an invitation.
        getRowClass={(params) =>
          statusOf(params.data as Project) === "FUNDED" ? "opacity-70" : undefined
        }
      />
    </div>
  );
}
