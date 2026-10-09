// app/(app)/crowdfunding/PortfolioDonut.tsx
"use client";

import { useEffect, useRef } from "react";
// AG Charts Community is MIT: no licence key, which is why this exists from
// the moment it was thought of. The registry call is idempotent and global —
// a second chart anywhere in the app may repeat it without harm.
import {
  AgCharts,
  ModuleRegistry,
  AllCommunityModule,
  type AgChartInstance,
  type AgChartOptions,
} from "ag-charts-community";

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * The three places your money can be, drawn as one ring.
 *
 * This is chart **C** of the split decided on 08-oct: the original idea was a
 * pie of purchases, investments, balances and transfers, and it fails on
 * arithmetic — those are two families (what you *have* and what you *moved*),
 * a purchase reduces the balance it is counted beside, and the total would be
 * a number that means nothing. Split, each half has a whole: this one is
 * **stock** — the state of what you have committed, which sums to exactly the
 * figure printed above it.
 *
 * It answers the question the card was never asked: *"$50 I pledged — where
 * is it?"* The answer is one of three, and now it is one glance.
 */
const SLICES = [
  // The same three colours the chips beside these rows already use, and the
  // same three Money in Flight uses one page over: green moved, blue held,
  // grey came back. A chart that invents a palette teaches a second one.
  { key: "paid", label: "Paid", note: "moved through PayPal", fill: "#099250" },
  { key: "reserved", label: "Reserved", note: "set aside, not taken", fill: "#0042a1" },
  { key: "returned", label: "Returned", note: "released back to you", fill: "#98a2b3" },
] as const;

export type PortfolioSliceKey = (typeof SLICES)[number]["key"];

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function buildOptions(
  amounts: Record<PortfolioSliceKey, number>,
  total: number,
  container: HTMLElement
): AgChartOptions {
  // Every slice stays in the data — `fills` cycles in *data* order, so
  // dropping the empty ones would hand the next colour to the wrong state and
  // quietly repaint what blue means. A slice worth zero takes no angle.
  const data = SLICES.map((slice) => ({
    key: slice.key,
    value: amounts[slice.key],
  }));

  return {
    container,
    data,
    series: [
      {
        type: "donut" as const,
        angleKey: "value",
        // Thin enough to read as a ring, thick enough that the centre can
        // carry the total — the number this chart is a picture of.
        innerRadiusRatio: 0.66,
        sectorSpacing: 3,
        fills: SLICES.map((slice) => slice.fill),
        // No callouts and no library legend — **measured, not assumed**: in a
        // 300px card the callouts for the left and right sectors are clipped
        // by the container, and a legend that does not fit paginates, showing
        // one of three states at a time behind ◀ 1/3 ▶ arrows. The legend
        // below this chart is our own markup: all three, always, in words,
        // with their amounts.
        calloutLabel: { enabled: false },
        innerLabels: [
          { text: money(total), fontSize: 18, fontWeight: "bold" as const, color: "#101828" },
          { text: "committed", fontSize: 11, color: "#667085", spacing: 2 },
        ],
        tooltip: { enabled: true },
      },
    ],
    legend: { enabled: false },
    background: { visible: false },
    height: 220,
    padding: { top: 8, right: 8, bottom: 0, left: 8 },
  };
}

function StateDonut({ amounts, total }: { amounts: Record<PortfolioSliceKey, number>; total: number }) {
  const container = useRef<HTMLDivElement | null>(null);
  const chart = useRef<AgChartInstance | null>(null);

  // Create once, then update: a capture moves one slice, and rebuilding the
  // whole chart would make the ring jump instead of change.
  useEffect(() => {
    if (!container.current) return;
    const options = buildOptions(amounts, total, container.current);
    if (chart.current) {
      void chart.current.update(options);
    } else {
      chart.current = AgCharts.create(options);
    }
  }, [amounts, total]);

  useEffect(
    () => () => {
      chart.current?.destroy();
      chart.current = null;
    },
    []
  );

  // Marked hidden: the drawing is decoration, because everything it says is
  // also written in the legend beneath it — for a screen reader and for
  // anyone whose browser never ran the chart.
  return <div ref={container} className="w-full" aria-hidden="true" />;
}

/**
 * `Your investments`, as a ring: paid, reserved and returned.
 *
 * Drawn only when there is something to draw. The legend is hand-written
 * rather than the chart's own, and the sentence at the top says what each
 * colour means — colour is never the only cue, here or anywhere in this app.
 */
export default function PortfolioDonut({
  amounts,
}: {
  amounts: Record<PortfolioSliceKey, number>;
}) {
  const total = amounts.paid + amounts.reserved + amounts.returned;
  if (total <= 0) return null;

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Where it is
      </h3>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
        Green moved · blue set aside · grey came back.
      </p>

      <div className="mt-1">
        <StateDonut amounts={amounts} total={total} />
      </div>

      <dl className="mt-2 space-y-1.5">
        {SLICES.map((slice) => (
          <div key={slice.key} className="flex items-baseline justify-between gap-2">
            <dt className="flex min-w-0 items-center gap-2 text-[11px] text-slate-600">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: slice.fill }}
              />
              <span className="truncate">
                {slice.label}
                <span className="text-slate-400"> · {slice.note}</span>
              </span>
            </dt>
            <dd className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-slate-900">
              {money(amounts[slice.key])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
