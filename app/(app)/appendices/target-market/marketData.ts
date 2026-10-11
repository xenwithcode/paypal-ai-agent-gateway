// app/(app)/appendices/target-market/marketData.ts
/**
 * The two figures on this appendix, as data.
 *
 * Deliberately not inside the client chart component: the drawing reads these
 * numbers and the page writes the same numbers in its own legend and prose,
 * and two copies of a figure is how a chart ends up disagreeing with the
 * sentence beside it. One module, imported by both — a number can only be
 * wrong in one place.
 *
 * Everything here is an estimate from published reports, which is why every
 * card on the page prints its source. The rule this appendix opens with has
 * not changed: no figure without a source a reader can follow.
 */

/** Millions of operations a year, one row per year. */
export type YearlyVolume = {
  year: string;
  /** Pago Móvil — the rail that grew. */
  mobile: number;
  /** Points of sale — the rail that shrank. */
  pos: number;
};

/** Estimated from SUDEBAN / BCV reports (2019–2024), in millions of operations. */
export const VOLUME_BY_YEAR: YearlyVolume[] = [
  { year: "2019", mobile: 120, pos: 150 },
  { year: "2020", mobile: 180, pos: 130 },
  { year: "2021", mobile: 250, pos: 110 },
  { year: "2022", mobile: 340, pos: 95 },
  { year: "2023", mobile: 410, pos: 85 },
  { year: "2024", mobile: 470, pos: 80 },
];

/** Billions of USD a year, one row per slice of the market. */
export type MarketRow = {
  label: string;
  /** Billions of USD, per year. */
  value: number;
  /** The colour this row is drawn in — and the same colour the legend dots use. */
  fill: string;
  /** What the number is, in the words a tooltip and a legend row both print. */
  note: string;
};

/**
 * The palette, said once.
 *
 * These four colours are already the app's vocabulary and they mean the same
 * thing here that they mean on Overview: blue is a rail that carries money,
 * green is money coming in, grey/red is something that is not working, light
 * blue is the first stage of a promise. Amber is the one spent deliberately —
 * on an operator's screen it means *you are running out of room*, and this
 * page has no ceiling to run out of, so here it takes its other reading: the
 * number that needs attention, the one nobody is serving.
 */
export const MARKET: MarketRow[] = [
  {
    label: "Mobile payments · annual volume",
    value: 40,
    fill: "#0042a1",
    note: "Pago Móvil and digital wallets",
  },
  {
    label: "Untouched fintech credit",
    value: 12,
    fill: "#f79009",
    note: "services, B2B, health, education, SMEs",
  },
  {
    label: "Remittances · 2026 projection",
    value: 5,
    fill: "#099250",
    note: "about 4% of GDP",
  },
  {
    label: "Traditional bank credit",
    value: 1.5,
    fill: "#f97066",
    note: "collapsed — 2.6% of GDP",
  },
  {
    label: "Cashea · financed volume (est.)",
    value: 0.8,
    fill: "#a9c5ec",
    note: "the wedge that already proved the market",
  },
];

/**
 * Where the number axis stops.
 *
 * The tallest bar is 40, and a value label placed outside its end needs room
 * to the right of it — with the axis ending exactly at the data's maximum the
 * label for the biggest bar is the one that gets clipped, which is precisely
 * the bar the chart exists to show. A ceiling above the data buys that room.
 */
export const MARKET_AXIS_MAX = 46;

/** The two rail colours of the first chart, named so the caption can say them. */
export const RAIL_COLORS = {
  mobile: "#0042a1",
  pos: "#98a2b3",
} as const;
