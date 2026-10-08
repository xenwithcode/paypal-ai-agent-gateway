// app/(app)/crowdfunding/ProgressCell.tsx
"use client";

import type { CustomCellRendererProps } from "ag-grid-react";
import { progressPct, remainingUsd, statusOf, type Project } from "@/lib/crowdfunding";

/**
 * How close a project is to its goal — the number this whole screen is about.
 *
 * Three states, because they mean three different things to somebody with $20:
 *
 *   under 95%   open, plenty of room
 *   95-100%     almost closed — the bar turns amber, which is the only place
 *               urgency is allowed to appear
 *   100%        funded: a solid dark bar and the words "goal reached", since
 *               a full green bar and a full grey one would say the same thing
 *               with different colours and no explanation
 *
 * The words are always on screen — percentage, raised of goal, and what is
 * missing — because colour is the second cue, never the only one, and because
 * a reader who cannot see colour still has to know that $7.500 is left.
 *
 * `title` carries the same sentence for anyone who hovers, and `aria-label`
 * carries it for anyone the grid reads out loud.
 */
export default function ProgressCell(params: CustomCellRendererProps) {
  const project = (params.data ?? null) as Project | null;
  if (!project) return null;

  const pct = progressPct(project);
  const funded = statusOf(project) === "FUNDED";
  const almostClosed = !funded && pct >= 0.95;
  const percent = Math.round(pct * 100);

  const band = funded ? "bg-slate-900" : almostClosed ? "bg-amber-500" : "bg-emerald-500";

  const label = funded
    ? `Funded — ${money(project.raisedUsd)} of ${money(project.goalUsd)}.`
    : `${percent}% funded — ${money(project.raisedUsd)} of ${money(project.goalUsd)}, ${money(remainingUsd(project))} missing.`;

  return (
    <span className="flex h-full flex-col justify-center gap-1 px-1" title={label}>
      <span className="flex items-baseline justify-between gap-2">
        <span
          className={`font-mono text-[13px] font-semibold leading-none ${
            almostClosed ? "text-amber-600" : "text-slate-900"
          }`}
        >
          {percent}%
        </span>
        <span className="truncate font-mono text-[11px] leading-none text-slate-500">
          {money(project.raisedUsd)} of {money(project.goalUsd)}
        </span>
      </span>

      <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <span
          className={`block h-full rounded-full transition-all ${band}`}
          style={{ width: `${percent}%` }}
          role="img"
          aria-label={label}
        />
      </span>

      <span className="block truncate text-[10px] leading-none text-slate-400">
        {funded ? "goal reached" : `${money(remainingUsd(project))} missing`}
      </span>
    </span>
  );
}

/** Whole dollars: this is a goal, not an invoice, and cents add no meaning. */
function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
