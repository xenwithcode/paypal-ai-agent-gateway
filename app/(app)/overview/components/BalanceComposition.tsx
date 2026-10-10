// app/(app)/overview/components/BalanceComposition.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
// AG Charts Community is MIT: no licence key, which is why this exists from the
// moment it was thought of.
import {
  AgCharts,
  ModuleRegistry,
  AllCommunityModule,
  type AgChartInstance,
  type AgChartOptions,
} from "ag-charts-community";

ModuleRegistry.registerModules([AllCommunityModule]);

import { balanceComposition, hasComposition, type BalanceSplit } from "@/lib/balanceComposition";
import type { PolicyRow } from "../types";

/**
 * What you have, split by what your own orders have committed.
 *
 * The sibling of *Money in flight*, which answers the other half of the same
 * question: that one shows the commitments, this one shows the balance they
 * are taken from. Drawn per currency, never summed — the rule this product
 * follows everywhere, and the one place it would be easiest to break, because
 * a single ring mixing USD with PYUSD looks like a total and is not one.
 */
const SLICES = [
  // The same blue Money in flight paints *Reserved*, so a reader who has
  // looked at one chart can read the other without learning a second colour.
  { key: "committed", label: "Committed to orders", fill: "#0042a1" },
  { key: "free", label: "Free to spend", fill: "#98a2b3" },
] as const;

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function buildOptions(split: BalanceSplit, container: HTMLElement): AgChartOptions {
  // Every slice stays in the data — `fills` cycles in *data* order, so
  // dropping the empty one would hand the next colour to the wrong state.
  const data = SLICES.map((slice) => ({ key: slice.key, value: split[slice.key] }));

  return {
    container,
    data,
    series: [
      {
        type: "donut" as const,
        angleKey: "value",
        innerRadiusRatio: 0.7,
        sectorSpacing: 2,
        fills: SLICES.map((slice) => slice.fill),
        // No callouts and no library legend, on purpose — measured on this
        // very app: in a narrow card the callouts clip and a legend that does
        // not fit paginates, showing one state at a time behind arrows. The
        // legend below is markup, so all of it is always visible.
        calloutLabel: { enabled: false },
        innerLabels: [
          { text: money(split.total), fontSize: 16, fontWeight: "bold" as const, color: "#101828" },
          { text: split.currency, fontSize: 11, color: "#667085", spacing: 2 },
        ],
        tooltip: { enabled: true },
      },
    ],
    legend: { enabled: false },
    background: { visible: false },
    height: 190,
    padding: { top: 8, right: 8, bottom: 0, left: 8 },
  };
}

function Ring({ split }: { split: BalanceSplit }) {
  const container = useRef<HTMLDivElement | null>(null);
  const chart = useRef<AgChartInstance | null>(null);

  // Create once, then update: the figure moves when money moves, and
  // rebuilding the chart would make the ring jump instead of change.
  useEffect(() => {
    if (!container.current) return;
    const options = buildOptions(split, container.current);
    if (chart.current) {
      void chart.current.update(options);
    } else {
      chart.current = AgCharts.create(options);
    }
  }, [split]);

  useEffect(
    () => () => {
      chart.current?.destroy();
      chart.current = null;
    },
    []
  );

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div ref={container} className="w-full" aria-hidden="true" />
      <dl className="mt-1 space-y-1.5">
        {SLICES.map((slice) => (
          <div key={slice.key} className="flex items-baseline justify-between gap-2">
            <dt className="flex min-w-0 items-center gap-2 text-[11px] text-slate-600">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.fill }}
              />
              <span className="truncate">{slice.label}</span>
            </dt>
            <dd className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-slate-900">
              {money(split[slice.key])}
            </dd>
          </div>
        ))}
      </dl>
      {split.committed > split.total && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
          Your orders reserve more than this balance holds — the rest is money that left outside
          this app. The ring cannot go below zero, so it shows the whole balance as committed.
        </p>
      )}
    </div>
  );
}

export default function BalanceComposition({
  entries,
  rows,
}: {
  /** Every currency PayPal reported — read on the server, passed down. */
  entries: readonly { currency: string; value: number }[];
  /** The table as it stands, so the commitments are the same ones. */
  rows: readonly PolicyRow[];
}) {
  const splits = useMemo(() => balanceComposition(entries, rows), [entries, rows]);
  if (!hasComposition(splits)) return null;

  return (
    <section
      aria-label="Balance composition"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3"
    >
      <div>
        <h2 className="text-base font-semibold text-slate-900">What you have</h2>
        {/* The sentence a chart cannot say about itself — and what a screen
            reader gets, since the drawing is marked hidden. */}
        <p className="mt-0.5 text-xs text-slate-500">
          One ring per currency, never added together. What your orders have set aside is taken
          out of what PayPal says is there — the other half of <em>Money in flight</em> below.
        </p>
      </div>

      {/* Wrapped rather than a fixed grid: with one currency — the usual case —
          a three-column grid leaves two thirds of the card empty, and the ring
          reads as an afterthought next to a white void. */}
      <div className="flex flex-wrap gap-4">
        {splits.map((split) => (
          <div key={split.currency} className="w-full max-w-[320px] grow">
            <Ring split={split} />
          </div>
        ))}
      </div>
    </section>
  );
}
