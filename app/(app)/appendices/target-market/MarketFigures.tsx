// app/(app)/appendices/target-market/MarketFigures.tsx
"use client";

import { useEffect, useRef } from "react";
// AG Charts Community is MIT — no licence key, the same library (and the same
// registry call) Overview and Crowdfunding already use. Idempotent and global,
// so a second chart anywhere in the app may repeat it without harm.
import {
  AgCharts,
  ModuleRegistry,
  AllCommunityModule,
  type AgChartInstance,
  type AgCartesianChartOptions,
  type AgChartOptions,
} from "ag-charts-community";

import { MARKET, MARKET_AXIS_MAX, RAIL_COLORS, VOLUME_BY_YEAR } from "./marketData";

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * The drawing, with its own lifecycle.
 *
 * Mount and unmount belong to the component, so create and destroy cannot
 * disagree with them: a chart instance whose container has already been
 * unmounted is a crash waiting for the next capture. Create once, then
 * `update` — rebuilding from scratch on every call would make a figure jump
 * instead of change.
 *
 * `build` is a module-level function, so its identity never moves and the
 * effect below runs once.
 */
function Draw({ build }: { build: (container: HTMLElement) => AgChartOptions }) {
  const container = useRef<HTMLDivElement | null>(null);
  const chart = useRef<AgChartInstance | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const options = build(container.current);
    if (chart.current) {
      void chart.current.update(options);
    } else {
      chart.current = AgCharts.create(options);
    }
  }, [build]);

  useEffect(
    () => () => {
      chart.current?.destroy();
      chart.current = null;
    },
    []
  );

  // Marked hidden: everything either chart says is also written in words on
  // the card — the caption, the legend and the figures in the prose. The
  // drawing is the picture of a sentence, not the only place the number exists.
  return <div ref={container} className="w-full" aria-hidden="true" />;
}

// Both builders declare the *cartesian* variant rather than `AgChartOptions`:
// that name is a union over cartesian, polar and friends, and checked against a
// bare union TS resolves `axes` to the polar member — which then refuses
// `category` and `number`. Naming the variant is what tells it which axes exist.

/**
 * Chart 1 — mobile payments against points of sale, 2019 → 2024.
 *
 * Two series, not one stacked series: the question is which rail is winning,
 * and stacking would hide the comparison inside a total nobody asked for.
 * Only the growing rail is labelled — six labels on the other series would
 * repeat a decline the axis already shows, and a label is worth printing when
 * it says something the shape does not.
 */
function buildVolumeChart(container: HTMLElement): AgCartesianChartOptions {
  return {
    container,
    data: VOLUME_BY_YEAR,
    series: [
      {
        type: "bar",
        xKey: "year",
        yKey: "mobile",
        yName: "Mobile payments (Pago Móvil)",
        fill: RAIL_COLORS.mobile,
        label: {
          enabled: true,
          // Outside the bar rather than inside it: the fill is dark and the
          // label sits on top of whichever bar is tallest, so a colour chosen
          // once could not fit both this series and the axis behind it.
          placement: "outside-end",
          color: "#344054",
          formatter: ({ value }: { value: unknown }) =>
            typeof value === "number" ? `${value}M` : "",
        },
      },
      {
        type: "bar",
        xKey: "year",
        yKey: "pos",
        yName: "Points of sale (POS)",
        fill: RAIL_COLORS.pos,
      },
    ],
    // Axes are a dictionary keyed by role (`x` / `y`), not an array — v14
    // changed this, and an array is rejected with an index-signature error
    // that names neither the fix nor the key.
    axes: {
      x: { type: "category", position: "bottom", title: { enabled: true, text: "Year" } },
      y: {
        type: "number",
        position: "left",
        title: { enabled: true, text: "Millions of operations a year" },
        min: 0,
      },
    },
    legend: { enabled: true, position: "bottom" },
    background: { visible: false },
    height: 340,
  };
}

/**
 * Chart 2 — the market in five slices, 2025–2026, in billions of USD a year.
 *
 * Horizontal, because five labels written for a vertical axis would have to
 * rotate or wrap to fit, and a rotated label is one a reader has to turn
 * their head for. The ceiling above the data is set in `marketData.ts`
 * for one reason: it buys room for the label on the tallest bar, which is
 * the bar this chart exists to show.
 *
 * The colour of each bar comes from the datum itself (`itemStyler`), so the
 * legend rows the page prints by hand and the bars the library draws read
 * the same array and cannot drift apart.
 */
function buildMarketChart(container: HTMLElement): AgCartesianChartOptions {
  return {
    container,
    data: MARKET,
    series: [
      {
        type: "bar",
        direction: "horizontal",
        xKey: "label",
        yKey: "value",
        // Fallback only; the item styler below paints every bar from its row.
        fill: RAIL_COLORS.mobile,
        itemStyler: ({ datum }: { datum: unknown }) => ({
          fill: (datum as (typeof MARKET)[number]).fill,
        }),
        label: {
          enabled: true,
          placement: "outside-end",
          color: "#344054",
          formatter: ({ value }: { value: unknown }) =>
            typeof value === "number" ? `$${value}B` : "",
        },
        tooltip: {
          renderer: ({ datum }: { datum: unknown }) => {
            const row = datum as (typeof MARKET)[number] | null;
            if (!row) return undefined;
            return {
              title: `${row.label} — $${row.value}B`,
              data: [{ label: row.note, value: "per year" }],
            };
          },
        },
      },
    ],
    axes: {
      y: { type: "category", position: "left" },
      x: {
        type: "number",
        position: "bottom",
        title: { enabled: true, text: "Billions of USD a year" },
        min: 0,
        max: MARKET_AXIS_MAX,
      },
    },
    // No library legend: it would repeat the five labels the axis already
    // prints, and the page's own legend underneath carries the note and the
    // exact figure for each bar — all five, always visible, never paginated.
    legend: { enabled: false },
    background: { visible: false },
    height: 300,
  };
}

/** The first figure, exported for the card that frames it. */
export function VolumeFigure() {
  return <Draw build={buildVolumeChart} />;
}

/** The second figure, exported for the card that frames it. */
export function MarketGapFigure() {
  return <Draw build={buildMarketChart} />;
}
