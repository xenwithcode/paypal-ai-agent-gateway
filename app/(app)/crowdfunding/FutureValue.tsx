// app/(app)/crowdfunding/FutureValue.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AgCharts,
  ModuleRegistry,
  AllCommunityModule,
  type AgChartInstance,
  type AgChartOptions,
} from "ag-charts-community";

ModuleRegistry.registerModules([AllCommunityModule]);

import { projectionSeries } from "@/lib/crowdfunding";

/**
 * What your own positions could become — G5, the "Simulador de futuro".
 *
 * The rule it draws is `projectionSeries`, not arithmetic in here: a growth
 * curve is the one number a savings pitch uses to lie, so the months, the
 * compounding and the refusal to invent a rate all live in a function with
 * tests, and this component only draws what it returns.
 *
 * **Two lines, always.** The grey one is what you put in and the green one is
 * what the campaign's offered rate would do to it — the gap is the growth,
 * and the gap can only exist above money that was actually deposited. A single
 * projected line would let the deposits hide inside the curve.
 */
const HORIZONS = [12, 24] as const;
type Horizon = (typeof HORIZONS)[number];

const money = (value: number, digits = 0): string =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function buildOptions(series: ReturnType<typeof projectionSeries>, container: HTMLElement): AgChartOptions {
  return {
    container,
    data: series,
    series: [
      {
        type: "line" as const,
        xKey: "month",
        yKey: "value",
        yName: "At the offered rate",
        stroke: "#099250",
        strokeWidth: 2.5,
        marker: { enabled: false },
      },
      {
        type: "line" as const,
        xKey: "month",
        yKey: "contributed",
        yName: "What you put in",
        // Dashed, and grey: it is the floor of the claim, not a competing
        // projection — a reader must not mistake the two for two forecasts.
        stroke: "#98a2b3",
        strokeWidth: 2,
        lineDash: [5, 4],
        marker: { enabled: false },
      },
    ],
    // A dictionary of axes, not a list: each axis is tied to the series keys
    // by its slot (`x`, `y`), which is the shape this version's options take.
    axes: {
      x: {
        type: "number" as const,
        position: "bottom" as const,
        min: 0,
        title: { enabled: true, text: "Months", color: "#667085", fontSize: 11 },
        label: { color: "#667085", fontSize: 11 },
        line: { stroke: "#e4e7ec" },
        tick: { stroke: "#e4e7ec" },
      },
      y: {
        type: "number" as const,
        position: "left" as const,
        min: 0,
        label: {
          color: "#667085",
          fontSize: 11,
          formatter: ({ value }: { value: unknown }) =>
            typeof value === "number" ? money(value) : "",
        },
        line: { enabled: false },
        tick: { stroke: "#e4e7ec" },
      },
    },
    legend: { enabled: true, position: "bottom" as const },
    background: { visible: false },
    height: 260,
    padding: { top: 12, right: 16, bottom: 8, left: 8 },
  };
}

function ProjectionChart({ plan }: { plan: Parameters<typeof projectionSeries>[0] }) {
  const container = useRef<HTMLDivElement | null>(null);
  const chart = useRef<AgChartInstance | null>(null);
  const series = useMemo(() => projectionSeries(plan), [plan]);

  useEffect(() => {
    if (!container.current || series.length === 0) return;
    const options = buildOptions(series, container.current);
    if (chart.current) {
      void chart.current.update(options);
    } else {
      chart.current = AgCharts.create(options);
    }
  }, [series]);

  useEffect(
    () => () => {
      chart.current?.destroy();
      chart.current = null;
    },
    []
  );

  if (series.length === 0) return null;
  return <div ref={container} className="w-full" aria-hidden="true" />;
}

/**
 * The simulator itself: a horizon, a monthly amount, and the two figures.
 *
 * Controls exist here because this is the one place in the product that
 * offers a *question* — "what if I kept going?" — and a question needs an
 * input. Everything else on this page states what is.
 */
export default function FutureValue({
  committed,
  returnPct,
}: {
  /** Money set aside or paid: what the projection starts from. */
  committed: number;
  /** The portfolio's own rate, weighted by money — never a figure invented here. */
  returnPct: number;
}) {
  const [horizon, setHorizon] = useState<Horizon>(12);
  const [monthly, setMonthly] = useState("20");

  const plan = useMemo(
    () => ({
      initialUsd: committed,
      monthlyUsd: Number(monthly),
      returnPct,
      months: horizon,
    }),
    [committed, monthly, returnPct, horizon]
  );

  const points = useMemo(() => projectionSeries(plan), [plan]);
  const last = points[points.length - 1];

  // Nothing to project: no money committed, or no rate to project it at. Both
  // are honest silences — a curve drawn from a rate nobody stated is exactly
  // what this product refuses to print.
  if (committed <= 0 || returnPct <= 0 || !last) return null;

  const growth = last.value - last.contributed;

  return (
    <section
      aria-label="What this could become"
      className="rounded-xl border border-slate-100 bg-slate-50 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            What this could become
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            At the{" "}
            <span className="font-semibold text-emerald-600">{returnPct.toFixed(1)}% a year</span>{" "}
            the campaigns you hold offer, compounded monthly.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {HORIZONS.map((months) => (
            <button
              key={months}
              type="button"
              onClick={() => setHorizon(months)}
              aria-pressed={horizon === months}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                horizon === months
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {months} months
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <label className="block" htmlFor="fv-monthly">
          <span className="block text-[11px] font-medium text-slate-600">
            Add each month (USD)
          </span>
          <input
            id="fv-monthly"
            type="number"
            min={0}
            max={10000}
            step="5"
            value={monthly}
            onChange={(event) => setMonthly(event.target.value)}
            className="mt-1 w-32 rounded-lg border border-slate-200 bg-white p-2 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="font-mono text-lg font-bold tabular-nums text-slate-900">
            {money(last.value)}
          </p>
          <p className="text-[11px] text-slate-400">
            in {horizon} months · {money(last.contributed)} of it is yours
          </p>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="font-mono text-lg font-bold tabular-nums text-emerald-700">
            +{money(growth)}
          </p>
          <p className="text-[11px] text-emerald-700/70">growth at the offered rate</p>
        </div>
      </div>

      <div className="mt-2">
        <ProjectionChart plan={plan} />
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        A projection, not a payment: the rate is what each project <em>offers</em>, and it is paid
        only out of what the business earns. Every dollar of the grey line is money you put in —
        nothing here counts a deposit you did not make.
      </p>
    </section>
  );
}
