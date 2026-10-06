// app/(app)/overview/components/CeilingCellRenderer.tsx
"use client";

import type { CustomCellRendererProps } from "ag-grid-react";
import { ceilingUsage } from "@/lib/policy";

type Row = {
  currency?: string;
  /** Catalog price at the last re-read, null when nothing matched. */
  marketPrice?: number | null;
};

/**
 * The ceiling, and how much of it the current price is using.
 *
 * The number alone made an approver do arithmetic in their head: a ceiling of
 * 100 with a price of 119.99 looks the same *shape* as a ceiling of 100 with a
 * price of 49.99, and that difference is the whole decision. The bar carries
 * the ratio, and colour is only ever a second cue — the words are still on
 * screen, spelled out, including `· exceeded` in text.
 *
 * Three bands, at the thresholds that mean something:
 *
 *   under 70%   there is room
 *   70-100%     close enough to the ceiling to look at
 *   over 100%   it cannot fill, which the number alone never said out loud
 *
 * No price means no bar. A missing reading is not a low one, and drawing a
 * short bar where the catalog returned nothing would invent a figure the row
 * does not have — the same rule the Condition column follows when it prints
 * `unverified` instead of choosing a verdict.
 *
 * Flat colour, no gradient and no shadow: this sits beside flat chips, and a
 * bar that looked lit would read as data rather than as a summary of it.
 */
export default function CeilingCellRenderer(params: CustomCellRendererProps) {
  const limit = Number(params.value);
  const data = (params.data ?? {}) as Row;
  const price = data.marketPrice;
  const currency = data.currency ?? "";

  // The words come from the column's own formatter, so the cell, an export
  // and the clipboard all describe the same ceiling the same way.
  const text = params.valueFormatted ?? String(params.value ?? "");
  const base = Number.isFinite(limit) ? `${limit.toFixed(2)} ${currency}`.trim() : text;

  const knownPrice = typeof price === "number" && Number.isFinite(price);
  // The bands live in lib/policy.ts beside the ceiling rule the judge applies:
  // one definition of where "close enough to the ceiling" starts, so the cell
  // and the refusal can never disagree about the same number.
  const usage = ceilingUsage(limit, price);
  const over = usage.over;

  const band =
    usage.band === "over"
      ? "bg-red-500"
      : usage.band === "near"
        ? "bg-amber-400"
        : usage.band === "low"
          ? "bg-emerald-500"
          : null;

  const label = knownPrice
    ? over
      ? `Price ${price!.toFixed(2)} ${currency} is above the ${base} ceiling. This order cannot fill.`
      : `Price ${price!.toFixed(2)} ${currency} of the ${base} ceiling in use.`
    : "No catalog price to measure against this ceiling.";

  return (
    <span className="flex h-full flex-col justify-center gap-1 px-1" title={label}>
      <span
        className={`block truncate text-right font-mono text-[13px] font-semibold leading-none ${
          over ? "text-red-700" : "text-emerald-600"
        }`}
      >
        {text}
      </span>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        {band && usage.ratio !== null ? (
          <span
            className={`block h-full rounded-full ${band}`}
            style={{ width: `${Math.round(usage.ratio * 100)}%` }}
            role="img"
            aria-label={label}
          />
        ) : null}
      </span>
      {/* The words, always: colour is the second cue, never the only one. */}
      <span className="block truncate text-right font-sans text-[10px] leading-none text-slate-400">
        {knownPrice ? `${price!.toFixed(2)} of ${base}` : "no price read"}
      </span>
    </span>
  );
}
