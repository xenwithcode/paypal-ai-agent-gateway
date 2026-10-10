// lib/balanceComposition.ts
//
// What you have, split into what is free and what your own orders have
// committed — one ring per currency.
//
// This is the sibling of `moneyInFlight`: that one answers *"lo que está en
// vuelo"* (the commitments), this one answers *"lo que tienes"* (the balance),
// and the pair is the point — a dashboard that shows only one of them hides
// the relationship between them.
//
// Pure and dependency-free, like the rule it sits beside: the split is the
// part that can be wrong silently, and a ring that subtracts a reservation
// twice looks exactly as convincing as one that does not.
//
// The extension is required rather than optional: Node's ESM resolver loads
// this module when the test suite runs, and it does not guess.
import { STATUS } from "./policy.ts";

/** Structural, so a test can build one without an SDK type in reach. */
export type BalanceEntry = {
  currency: string;
  value: number;
  primary?: boolean;
};

/** The minimum shape this module needs from an order. */
type RowLike = { status: string; limit: number; currency: string };

export type BalanceSplit = {
  currency: string;
  /** What PayPal says is there. */
  total: number;
  /** Reserved by an order of yours, in this currency. */
  committed: number;
  /** `total − committed`, never below zero — see the note below. */
  free: number;
};

/**
 * Split each currency's balance into free and committed.
 *
 * Four rules, each of them a way to be quietly wrong:
 *
 * **Only `Reserved` commits.** A captured order already left the balance, a
 * released one gave the money back, an awaiting one holds nothing and a
 * standing allowance reserves nothing by design. Counting any of those would
 * report money that is not there as committed.
 *
 * **Currencies are never summed.** One ring per currency, the rule this whole
 * product follows: 100 USD and 100 PYUSD are not 200 of anything, and a ring
 * that mixed them would be the first place the app broke its own law.
 *
 * **A reservation is clamped at zero, not allowed to go negative.** If your
 * orders reserve more than the balance shows — money moved outside this app,
 * or a hold placed before a withdrawal — the honest ring is *all committed*,
 * and the caller can see `committed > total` and say so. A negative "free"
 * slice is a number no reader can reconcile with anything.
 *
 * **Only currencies PayPal reported are drawn.** A reservation in a currency
 * the account holds nothing in is already visible in *Money in flight*; drawn
 * here as a ring of nothing, it would be a circle with no explanation.
 */
export function balanceComposition(
  entries: readonly BalanceEntry[],
  rows: readonly RowLike[]
): BalanceSplit[] {
  const byCurrency = new Map<string, number>();

  for (const row of rows) {
    if (row.status !== STATUS.reserved) continue;
    if (!Number.isFinite(row.limit) || row.limit <= 0) continue;
    if (typeof row.currency !== "string" || !row.currency) continue;
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.limit);
  }

  const splits: BalanceSplit[] = [];
  for (const entry of entries) {
    if (!entry.currency || !Number.isFinite(entry.value) || entry.value <= 0) continue;

    const committed = byCurrency.get(entry.currency) ?? 0;
    splits.push({
      currency: entry.currency,
      total: entry.value,
      committed,
      free: Math.max(0, entry.value - committed),
    });
  }

  // Sorted by currency so the row does not reorder itself as balances move —
  // the same reason `moneyInFlight` sorts: a chart whose categories shuffle
  // reads as motion that means nothing.
  return splits.sort((a, b) => a.currency.localeCompare(b.currency));
}

/** True when there is something to draw. A ring of nothing is not a ring. */
export function hasComposition(rows: readonly BalanceSplit[]): boolean {
  return rows.some((row) => row.total > 0);
}
