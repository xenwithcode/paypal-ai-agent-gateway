// lib/moneyInFlight.ts
//
// What is waiting at the door — the one figure no payment dashboard draws.
//
// A normal dashboard shows a balance: one number that says how much you have.
// This shows money *in the state of being decided* — drafted and not yet
// approved, set aside but not yet moved, moved, and given back. Those are four
// different promises about the same dollar, and only one of them is the
// balance.
//
// Pure and dependency-free so the rule can be tested without a browser, a
// chart, or a PayPal credential — because the rule is the part that can be
// wrong silently. A chart that adds USD to PYUSD looks exactly as convincing
// as one that does not.
//
// The extension is required and not a style choice: Node's ESM resolver is
// what loads this module when the test suite runs, and it does not guess.
// The rule is written in tsconfig.json — reachable from a test means every
// import in its graph carries the extension.
import { STATUS } from "./policy.ts";

/** The four states where an order is making a claim on money. */
export const FLIGHT_STATES = {
  awaiting: STATUS.pending,
  reserved: STATUS.reserved,
  captured: STATUS.captured,
  released: STATUS.released,
} as const;

export type FlightBucket = keyof typeof FLIGHT_STATES;

export type FlightRow = {
  /** Never merged with another currency — see the note on `moneyInFlight`. */
  currency: string;
  awaiting: number;
  reserved: number;
  captured: number;
  released: number;
};

/** The minimum shape this module needs. Structural so nothing has to import
 *  a component's types to be able to test the rule. */
type RowLike = { status: string; limit: number; currency: string };

/**
 * Bucket the rows, grouped by currency.
 *
 * Four decisions, each of them a way to be quietly wrong:
 *
 * **The amount is `limit`, not the catalog price.** The server reserves,
 * captures and releases exactly the ceiling — `holds/route.ts` logs
 * `Captured {limit}` and `Released … {limit} returned`. Charting the catalog
 * price instead would show a number the ledger has never seen.
 *
 * **`Active` is not in flight.** A standing allowance holds nothing: the
 * status exists precisely because "a subscription does not reserve its own
 * money every month, it simply may not be spent beyond the ceiling". Counting
 * it would inflate the figure with money that was never set aside. `Protecting`
 * is the FX shield rather than an order, so it is out for the same reason.
 *
 * **Currencies are never summed.** One row per currency: 100 USD and 100 PYUSD
 * are not 200 of anything, and the project already splits every total by
 * currency for exactly that reason.
 *
 * **A limit that is not a number is not money.** Zero, negative or NaN are
 * skipped rather than read as an empty segment — a bar that quietly drops a
 * row is a bar that lies about what it measured.
 */
export function moneyInFlight(rows: readonly RowLike[]): FlightRow[] {
  const byCurrency = new Map<string, FlightRow>();

  for (const row of rows) {
    const bucket = (Object.keys(FLIGHT_STATES) as FlightBucket[]).find(
      (key) => FLIGHT_STATES[key] === row.status
    );
    if (!bucket) continue;

    if (!Number.isFinite(row.limit) || row.limit <= 0) continue;
    if (typeof row.currency !== "string" || !row.currency) continue;

    let entry = byCurrency.get(row.currency);
    if (!entry) {
      entry = { currency: row.currency, awaiting: 0, reserved: 0, captured: 0, released: 0 };
      byCurrency.set(row.currency, entry);
    }
    entry[bucket] += row.limit;
  }

  // Sorted so the axis does not reorder itself as rows are added and removed —
  // a bar chart whose categories shuffle on every capture reads as motion that
  // means nothing.
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** True when there is something to draw. A chart of zeros is not a chart. */
export function hasMoneyInFlight(rows: readonly FlightRow[]): boolean {
  return rows.some((row) => row.awaiting + row.reserved + row.captured + row.released > 0);
}
