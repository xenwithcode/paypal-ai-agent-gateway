// lib/transactionTotals.ts
//
// What came in, what went out, and what it cost — from PayPal's own records.
//
// Separate from the grid on purpose: the grid shows rows as they arrived, and
// a total is an opinion about them. Keeping the arithmetic in its own module
// is what lets it be tested against rows the grid never sees, and what stops a
// caption from doing sums that nobody can check.
//
// Three figures rather than one, for two reasons that were found by running
// this against the account rather than by reasoning about it:
//
//   1. directions are split. `transactionAmount.value` is positive when money
//      enters this account and negative when it leaves — the same convention
//      PayPal's own `endingBalance` follows — so "in" and "out" restate the
//      sign instead of guessing at what the payment *was*. A refund, a reversal
//      and a sale are all money moving; this reports which way.
//
//   2. fees are separate. The account's real records showed `+100.00` with a
//      `feeAmount` of `-5.70` and an `endingBalance` that moved by `94.30`.
//      Adding the amount alone reported 5,100 arriving when 5,094.30 arrived —
//      a total that does not reconcile with the balance it belongs to is worse
//      than no total, so the fee is read from its own field and reported on
//      its own line rather than quietly folded in.

/** One currency's movements, as PayPal reported them. */
export type AmountSummary = {
  currency: string;
  /** Sum of the positive amounts. */
  inAmount: number;
  /** Sum of the negative amounts, as a positive figure. */
  outAmount: number;
  /** Sum of the fees, as magnitudes — a fee is a cost however it is signed. */
  fees: number;
  /** How many rows carried an amount in this currency. */
  counted: number;
};

export type Summary = {
  /** One entry per currency mentioned by an amount or a fee. */
  currencies: AmountSummary[];
  /** Rows whose amount could be read. */
  counted: number;
  /**
   * Rows with no readable amount.
   *
   * Counted rather than quietly dropped: a total that silently skipped two
   * rows would look complete and be wrong in a way nobody could see.
   */
  uncounted: number;
};

/** One of PayPal's money fields — `{ currencyCode, value }` — or null. */
function readMoney(field: unknown): { currency: string; value: number } | null {
  const money = field as Record<string, unknown> | undefined;
  if (!money || typeof money !== "object") return null;

  const currency = money.currencyCode;
  if (typeof currency !== "string" || !currency.trim()) return null;

  // The wire carries money as a string ("-1.00"), not as a number. `Number`
  // handles both, and anything that parses to NaN is a value this total must
  // not include — an unreadable amount is missing, not zero.
  const raw = money.value;
  const value =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isFinite(value)) return null;

  return { currency, value };
}

/**
 * Sum a transaction list into per-currency totals, split by direction and
 * with fees reported apart.
 *
 * Rows without a readable amount are reported as `uncounted` rather than
 * folded in as zero, because a total that quietly skipped records would look
 * complete and be wrong in a way no reader could see.
 */
export function summariseTransactions(rows: readonly Record<string, unknown>[]): Summary {
  const byCurrency = new Map<string, AmountSummary>();
  let counted = 0;
  let uncounted = 0;

  const entryFor = (currency: string): AmountSummary => {
    let entry = byCurrency.get(currency);
    if (!entry) {
      entry = { currency, inAmount: 0, outAmount: 0, fees: 0, counted: 0 };
      byCurrency.set(currency, entry);
    }
    return entry;
  };

  for (const row of rows) {
    const info = row.transactionInfo as Record<string, unknown> | undefined;
    const amount = readMoney(info?.transactionAmount);

    if (amount) {
      counted += 1;
      const entry = entryFor(amount.currency);
      entry.counted += 1;
      if (amount.value > 0) entry.inAmount += amount.value;
      else if (amount.value < 0) entry.outAmount += Math.abs(amount.value);
      // Zero is a real amount on a real record. Inventing a bucket for it
      // would invent a movement that did not happen.
    } else {
      uncounted += 1;
    }

    // The fee is its own field and its own direction, and it is summed whether
    // or not the amount above could be read: a row that reports a fee has had
    // money spent whether or not it reported an amount this total understands.
    const fee = readMoney(info?.feeAmount);
    if (fee) entryFor(fee.currency).fees += Math.abs(fee.value);
  }

  return { currencies: [...byCurrency.values()], counted, uncounted };
}
