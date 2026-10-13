// app/(app)/overview/components/MoneyInFlight.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// The chart library, not the grid's: AG Charts Community is MIT, so this runs
// without any licence key — the thing worth knowing about the sponsor's stack,
// because it means this existed from the moment it was thought of.
import {
  AgCharts,
  ModuleRegistry,
  AllCommunityModule,
  type AgChartInstance,
  type AgChartOptions,
} from "ag-charts-community";

// AG Charts is modular exactly as the grid is: `AgCharts.create()` refuses to
// run until the modules it needs are registered. Idempotent and global, so
// this can live beside the one chart that uses it — a second chart anywhere in
// the app may repeat it without harm. The message tells you this when you get
// it wrong, which is why it is worth writing down rather than rediscovering.
ModuleRegistry.registerModules([AllCommunityModule]);
import { hasMoneyInFlight, moneyInFlight, type FlightMember, type FlightRow } from "@/lib/moneyInFlight";
import type { PolicyRow } from "../types";

/**
 * One colour per state, chosen to say something rather than to decorate —
 * and read as a progression, because that is what a lifecycle is:
 *
 *   light blue — waiting on you      (nothing is held yet)
 *   blue       — held by the gateway (set aside, has not moved)
 *   green      — moved               (settled, the money is gone)
 *   grey       — came back           (released, the money is yours again)
 *
 * All four are the palette the rest of the page already uses, so the chart
 * agrees with the console and the grid about what each colour means.
 *
 * Amber used to be the first one and was changed deliberately: the ceiling
 * cell two cards down uses amber for "close to your limit" (`ceilingUsage`),
 * and two widgets on one screen giving amber two meanings is a collision the
 * operator found without being told. Amber now means exactly one thing in this
 * app — you are running out of room.
 */
const SEGMENTS = [
  { key: "awaiting", label: "Awaiting approval", fill: "#a9c5ec", labelColor: "#101828" },
  { key: "reserved", label: "Reserved", fill: "#0042a1", labelColor: "#ffffff" },
  { key: "captured", label: "Captured", fill: "#099250", labelColor: "#ffffff" },
  { key: "released", label: "Released", fill: "#98a2b3", labelColor: "#101828" },
] as const;

/** How many orders a tooltip lists before it folds the rest into a sum. */
const MAX_TOOLTIP_ROWS = 6;

/**
 * Hovering a segment: the state, the amount, and **what it is made of**.
 *
 * The question a reader asks a bar is not "how much" — the label on the
 * segment already says that — but *which orders* are in it, which until now
 * meant counting rows against the table by eye. The names come from
 * `moneyInFlight`, so what the tooltip lists is exactly what the total sums,
 * to the cent.
 *
 * Returns `undefined` for an empty segment: a tooltip on a slice with no
 * angle would report `0.00 USD` of nothing.
 */
function segmentTooltip(
  segment: (typeof SEGMENTS)[number],
  datum: unknown
): { title: string; data: { label: string; value: string }[] } | undefined {
  const row = datum as FlightRow | null;
  if (!row || typeof row[segment.key] !== "number") return undefined;
  const value = row[segment.key];
  if (value === 0) return undefined;

  const members = row.members?.[segment.key] ?? [];
  const shown = members.slice(0, MAX_TOOLTIP_ROWS);
  const folded = members.slice(MAX_TOOLTIP_ROWS);
  const per = (amount: number) => `${amount.toFixed(2)} ${row.currency}`;

  return {
    title: `${segment.label} — ${per(value)}`,
    data: [
      ...shown.map((member) => ({ label: member.what, value: per(member.amount) })),
      ...(folded.length > 0
        ? [
            {
              label: `and ${folded.length} more`,
              value: per(folded.reduce((sum, member) => sum + member.amount, 0)),
            },
          ]
        : []),
    ],
  };
}

function buildOptions(
  data: FlightRow[],
  container: HTMLElement,
  onSegmentClick?: (
    segment: (typeof SEGMENTS)[number],
    members: FlightMember[]
  ) => void
): AgChartOptions {
  return {
    container,
    data,
    // One series per segment rather than one series with four keys: a stacked
    // bar in AG Charts is stacked *series*, and each one gets its own colour
    // and its own legend entry — which is also what makes the legend clickable.
    series: SEGMENTS.map((segment) => ({
      // The segment's own key as the series id, so the click handler can
      // name the segment that was hit. `itemId` would have been the trap: on
      // a bar node it falls back to the *datum index*, so clicking the first
      // bar of any series would have looked like clicking "awaiting".
      id: segment.key,
      type: "bar" as const,
      direction: "horizontal" as const,
      stacked: true,
      xKey: "currency",
      yKey: segment.key,
      yName: segment.label,
      fill: segment.fill,
      // No rounding inside the stack: a radius on every segment reads as four
      // separate bars sitting next to each other, which is the opposite of
      // "these are parts of one amount".
      cornerRadius: 0,
      // The exact amount on the segment. An axis running 0…800 says what the
      // commitment looks like; it does not say the number, and a money figure
      // you have to hover to read is a figure most readers never read.
      //
      // Two things the default gets wrong: a segment worth zero still gets a
      // label, which paints a stray "0" just outside the end of the stack —
      // visible in the first screenshot — and the bare number disagrees with
      // the grid two cards below, where money is always two decimals.
      //
      // The colour is set rather than left to the library because the light
      // segment has no rows to draw today — both USD orders are Captured — so
      // the one contrast that could fail is the one there is no way to look at
      // until the next order is drafted. White on a light fill is invisible;
      // that does not need observing to be true.
      label: {
        enabled: true,
        color: segment.labelColor,
        formatter: ({ value }: { value: unknown }) =>
          typeof value === "number" && value !== 0
            ? value.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : "",
      },
      // The names, on hover: the segment says the amount and this says which
      // orders it is made of — same rows, same source, so the two numbers in
      // one sentence cannot disagree.
      //
      // The parameter is annotated because `series` is built by a `map` and a
      // mapped literal has nothing left to infer it from — the same reason the
      // `formatter` above declares its own `{ value }`.
      tooltip: {
        renderer: (params: { datum: unknown }) => segmentTooltip(segment, params.datum),
      },
    })),
    // No explicit `axes`: AG Charts places a category axis on the left and a
    // number axis along the bottom for a horizontal bar on its own, and naming
    // them would have to pick a member of a union that also contains the polar
    // chart types — asking for a type this chart is not.
    legend: { enabled: true, position: "bottom" as const },
    // The amount is the sum of rows; clicking it opens the rows. The figure
    // a reader points at ("200.00 awaiting") and the order it describes live
    // on two cards that used to have no gesture between them.
    //
    // The chart hands the segment over with its members and lets the card
    // decide: one order opens itself, several ask which — a sum must never
    // open a single card and pass for the whole figure.
    listeners: onSegmentClick
      ? {
          seriesNodeClick: (event) => {
            const segment = SEGMENTS.find((candidate) => candidate.key === event.seriesId);
            if (!segment) return;
            const members = (event.datum as FlightRow | null)?.members?.[segment.key] ?? [];
            if (members.length === 0) return;
            onSegmentClick(segment, members);
          },
        }
      : undefined,
    background: { visible: false },
    // Grows with the number of currencies. A fixed height sized for one bar
    // squeezes three into a strip where the segments stop being comparable,
    // and the whole point of the drawing is comparison.
    height: 110 + data.length * 55,
  };
}

/**
 * The chart itself, so that its lifecycle is its own.
 *
 * Split from the card for one reason: the container only exists while there
 * is something to draw, and a chart instance whose element has been unmounted
 * is a crash waiting for the next capture. Here mount and unmount are the
 * component's, so create and destroy cannot disagree with them.
 */
function FlightChart({
  rows,
  onSegmentClick,
}: {
  rows: FlightRow[];
  onSegmentClick?: (
    segment: (typeof SEGMENTS)[number],
    members: FlightMember[]
  ) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const chart = useRef<AgChartInstance | null>(null);

  // Create once, then update: the difference is the point. Recreating the
  // chart on every capture would redraw it from scratch, and this figure is
  // meant to *move* — a bar that jumps because it was rebuilt again reads as
  // a different number rather than the same number changing.
  //
  // The click handler rides along in the same update: the options object is
  // the whole chart, listener included.
  useEffect(() => {
    if (!container.current) return;
    const options = buildOptions(rows, container.current, onSegmentClick);
    if (chart.current) {
      void chart.current.update(options);
    } else {
      chart.current = AgCharts.create(options);
    }
  }, [rows, onSegmentClick]);

  useEffect(
    () => () => {
      chart.current?.destroy();
      chart.current = null;
    },
    []
  );

  // A pointer over the segments only when there is something to open: a
  // cursor that promises a click and finds none is a dead affordance.
  return (
    <div
      ref={container}
      className={`w-full${onSegmentClick ? " cursor-pointer" : ""}`}
      aria-hidden="true"
    />
  );
}

/**
 * Money in flight: the four ways an order can be holding a claim on your
 * money, drawn as one stacked bar per currency.
 *
 * This is the figure a balance cannot show. The header reads PayPal's number —
 * how much you *have* — and this reads your own table: how much is proposed,
 * how much is set aside, how much has moved and how much came back. Nothing
 * here is derived from the model or from a guess; it is the sum of `limit` over
 * the rows in each state, and `limit` is what the server actually reserves,
 * captures and releases.
 *
 * It has no controls because it has no decisions to offer. It is here to be
 * read in a glance and to make the table below it legible as a whole — a
 * reader who can see the totals finds the row that explains them.
 */
export default function MoneyInFlight({
  rows,
  onOpenOrder,
}: {
  rows: readonly PolicyRow[];
  /**
   * Open the approval card of the order behind a clicked segment.
   *
   * The `total` is how many orders the segment holds, so the caller can say
   * out loud when one card is only part of the figure — the number on the
   * segment is a sum, and a sum opened as a single order would read as that
   * order's price.
   */
  onOpenOrder?: (id: number, total: number) => void;
}) {
  const flight = useMemo(() => moneyInFlight(rows), [rows]);
  const visible = hasMoneyInFlight(flight);

  /**
   * The segment that asked *which order*, waiting for an answer.
   *
   * A segment holding one order opens it; a segment holding several used to
   * open the first and say so in the console — which left the operator
   * hunting for the other two by hand, exactly what happened on 13-oct with
   * a $500 awaiting segment holding two Chelsea boots and one chaqueta. The
   * sum may not pick a card for the reader; it may only ask.
   */
  const [chooser, setChooser] = useState<{
    label: string;
    currency: string;
    members: FlightMember[];
  } | null>(null);

  // The table moved under it — an order captured, a new one drafted — so the
  // list is about a figure that no longer exists. Cleared rather than left to
  // point at rows that changed.
  useEffect(() => {
    setChooser(null);
  }, [rows]);

  const openSegment = (
    segment: (typeof SEGMENTS)[number],
    members: FlightMember[]
  ) => {
    const withId = members.filter((member) => typeof member.id === "number");
    // One identifiable order: open it. That is the whole gesture — the
    // chooser only exists because several orders deserve a choice.
    if (members.length === 1 && withId.length === 1) {
      onOpenOrder?.(withId[0].id as number, members.length);
      return;
    }
    const currency = flight.find((row) => row.members?.[segment.key] === members)?.currency ?? "";
    setChooser({ label: segment.label, currency, members });
  };

  return (
    <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Money in flight</h2>
        {/* The sentence a chart cannot say about itself. It is also what a
            screen reader gets: the drawing is marked hidden, so this line is
            the only description of it that exists for anyone not looking. */}
        <p className="mt-0.5 text-xs text-slate-500">
          One bar per currency — never added together. Four states of the same promise: drafted,
          set aside, moved, given back. The balance in the header is what you have; this is what
          is committed. Hover a segment to see the orders it holds; click it to open one — when
          it holds several, it asks which.
        </p>
      </div>

      {visible ? (
        <FlightChart rows={flight} onSegmentClick={openSegment} />
      ) : (
        <p className="text-sm text-slate-500 py-4">
          Nothing is in flight — no order is awaiting your approval, and nothing is held.
        </p>
      )}

      {/* The sum answering back: which order is this amount made of? Each row
          opens its own card — the same gesture the grid's rows do — and a
          member the table cannot name (no id) says so rather than pretending
          to be openable. */}
      {chooser && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
            <p className="text-xs font-semibold text-slate-700">
              {chooser.label} holds {chooser.members.length} order
              {chooser.members.length === 1 ? "" : "s"} — which one?
            </p>
            <button
              type="button"
              onClick={() => setChooser(null)}
              aria-label="Close the list of orders"
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
          <ul className="mt-1 divide-y divide-slate-200">
            {chooser.members.map((member, index) =>
              typeof member.id === "number" ? (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenOrder?.(member.id as number, chooser.members.length);
                      setChooser(null);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white hover:shadow-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                      {member.what}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">
                      {member.amount.toFixed(2)}
                      {chooser.currency ? ` ${chooser.currency}` : ""}
                    </span>
                  </button>
                </li>
              ) : (
                <li
                  key={`unnamed-${index}`}
                  className="flex items-center justify-between gap-3 px-2 py-2 text-xs text-slate-400"
                >
                  <span className="min-w-0 flex-1 truncate italic">{member.what}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {member.amount.toFixed(2)}
                    {chooser.currency ? ` ${chooser.currency}` : ""}
                  </span>
                </li>
              )
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
