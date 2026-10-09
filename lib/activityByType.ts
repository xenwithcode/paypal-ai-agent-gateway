// lib/activityByType.ts
//
// Where the money that actually moved went: purchases, investments,
// transfers.
//
// The three books on /activity already answer *what* happened — the account's
// own record, the orders that settled, the charges that were refused. This
// answers the question above them: **adónde se fue el dinero**, by kind.
//
// Pure and dependency-free, like the rule it sits beside (`moneyInFlight`):
// the classification is the part that can be wrong silently — a chart that
// counts an investment as a purchase looks exactly as convincing as one that
// does not.
import { STATUS } from "./policy.ts";

export type ActivityKind = "purchase" | "investment" | "transfer";

/** The kinds, in the order they are drawn. */
export const ACTIVITY_KINDS = ["investment", "transfer", "purchase"] as const;

/** The minimum shape this module needs. Structural, so a test needs no store. */
export type ActivityRow = {
  status: string;
  limit: number;
  currency: string;
  /** Set when the order funds a campaign — the unambiguous mark of a stake. */
  project?: string;
  /** The account the money is directed to, when it names one. */
  payee?: string;
  /** The host a purchase reaches. Empty on anything that is not a purchase. */
  allowEndpoint?: string;
};

/**
 * What kind of spending one settled order was.
 *
 * Asked in this order, and the order is the rule:
 *
 *   1. **`project`** — a stake in a campaign. It is also, in PayPal's terms, a
 *      transfer to a business, so it has to be asked for first or it would
 *      disappear into the second case.
 *   2. **`payee` with no host** — a transfer names an account and reaches no
 *      endpoint; that is exactly how `/send` builds the row, and the comment
 *      on its envelope says so ("a transfer names an account, not an
 *      endpoint").
 *   3. **everything else** — a purchase: it reached a host, or it names a
 *      merchant, or it was drafted from the catalogue.
 *
 * The fallback is a purchase rather than "unknown" because that is what the
 * other two shapes leave, and a settled order is a settled order: refusing to
 * classify it would drop money from the totals — and a total that omits a row
 * in silence is worse than one that includes it under the wrong name.
 */
export function activityKindOf(
  row: Pick<ActivityRow, "project" | "payee" | "allowEndpoint">
): ActivityKind {
  if ((row.project ?? "").trim() !== "") return "investment";
  if ((row.payee ?? "").trim() !== "" && (row.allowEndpoint ?? "").trim() === "") {
    return "transfer";
  }
  return "purchase";
}

export type ActivityByCurrency = {
  currency: string;
  investment: number;
  transfer: number;
  purchase: number;
  /** What the three add up to — the figure the bars are a picture of. */
  total: number;
};

/**
 * Totals per currency, by kind.
 *
 * Four rules, each of them a way to be quietly wrong:
 *
 * **Only `Captured` counts.** A reserved order holds money and a released one
 * gave it back; neither moved, and both are already shown — the first in
 * *Money in flight* on Overview, the second as `Returned` in the portfolio.
 * Counting them here would report money twice, in two different stories.
 *
 * **Currencies are never summed.** One entry per currency, the same rule
 * `moneyInFlight` follows: 100 USD and 100 PYUSD are not 200 of anything.
 *
 * **A limit that is not money is skipped**, not counted as zero — a bar that
 * quietly drops a row lies about what it measured.
 *
 * **Sorted by currency**, so the axis does not reorder itself as rows arrive.
 */
export function activityByType(rows: readonly ActivityRow[]): ActivityByCurrency[] {
  const byCurrency = new Map<string, ActivityByCurrency>();

  for (const row of rows) {
    if (row.status !== STATUS.captured) continue;
    if (!Number.isFinite(row.limit) || row.limit <= 0) continue;
    if (typeof row.currency !== "string" || !row.currency) continue;

    let entry = byCurrency.get(row.currency);
    if (!entry) {
      entry = { currency: row.currency, investment: 0, transfer: 0, purchase: 0, total: 0 };
      byCurrency.set(row.currency, entry);
    }

    const kind = activityKindOf(row);
    entry[kind] += row.limit;
    entry.total += row.limit;
  }

  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** True when there is something to draw. Three zero bars are not a chart. */
export function hasActivity(rows: readonly ActivityByCurrency[]): boolean {
  return rows.some((row) => row.total > 0);
}
