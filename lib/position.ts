// lib/position.ts
//
// One screen's worth of money: what you have, what your orders have set
// aside, and what you have put into campaigns — as **two ledgers that are
// never added together**.
//
// The dashboard already answers these questions in three cards (the balance
// in the header, *Money in flight*, *What you have*), and none of them says
// what a person actually opens a financial screen to find: **how much can I
// spend right now**. This module exists to answer it once, in one place, and
// to keep the two ledgers apart while doing so.
//
// Why the refusal to add them is written here rather than in the component:
// this is the exact mistake the project rejected on its first day — a pie
// that summed *purchases + balances + transfers*, where a purchase reduces
// the balance it was counting. The same trap is waiting in this card:
//
//   - a crowdfunding pledge that is `Reserved` is **already inside** the
//     PayPal balance (a hold moves nothing), so adding `invested.reserved`
//     to `balances[].total` counts the same dollar twice;
//   - an `Awaiting approval` row has touched nothing at all;
//   - a `Released` pledge gave the money back, so it is history, not
//     holdings.
//
// So the module returns the two ledgers **side by side**, and there is
// deliberately no field anywhere in this file that adds them. A caller that
// wants a single grand total has to write the addition itself — in front of
// a reviewer, where it belongs.
//
// Pure and dependency-free, like the rules it composes (`balanceComposition`
// for the split, `earnsDividend`/`dividendOn`/`weightedReturnPct` for the
// accrual): the split and the accrual are both things that can be wrong
// silently, and a card that subtracts a reservation twice looks exactly as
// convincing as one that does not.
import { STATUS } from "./policy.ts";
import { balanceComposition, type BalanceEntry, type BalanceSplit } from "./balanceComposition.ts";
import { dividendOn, earnsDividend, weightedReturnPct } from "./crowdfunding.ts";

/**
 * The minimum shape of an order this module reads.
 *
 * Structural on purpose: the grid's `PolicyRow`, the portfolio's
 * `ManifestRow` and a test's literal all satisfy it, and none of them has to
 * import an SDK type to do so.
 */
export type PositionRow = {
  status: string;
  /** The ceiling — the amount this order sets aside. Always USD here. */
  limit: number;
  currency: string;
  /** Named so the tooltip can say which row the committed money belongs to. */
  what?: string;
  /** The campaign this order funds, if it funds one. */
  project?: string;
  /** True while the row is a demonstration rather than an operator's money. */
  sample?: boolean;
  /**
   * What has to be true before the order runs — printed verbatim by the
   * standing block, because a condition this card summarised would be a
   * second opinion about a rule only the server judges.
   */
  condition?: string;
  /** When PayPal set the money aside — the day a dividend accrues from. */
  createdAt?: string | null;
  capturedAt?: string | null;
};

/** The one field of a campaign this card needs: the rate it offers. */
export type ProjectLike = { id: string; returnPct: number };

/** What is in PayPal, per currency — never summed across currencies. */
export type Spendable = { currency: string; value: number };

/**
 * The second ledger: what sits in campaigns.
 *
 * Three figures, never one — the rule `/crowdfunding` already follows, and
 * the reason this card may not print a single "invested" number: a business
 * that has not received the money must not appear to have.
 */
export type InvestedPosition = {
  /** `Captured`: the money moved. The business has it. */
  paid: number;
  /** `Reserved`: set aside, still inside the balance above — not taken. */
  reserved: number;
  /** `Released`: the hold was cancelled and nothing was taken. */
  returned: number;
  /** `paid + reserved` — what is still on the table with a campaign. */
  committed: number;
  /** `committed + returned` — everything that ever was pledged. */
  placed: number;
  count: number;
  /** True only while every position is a demonstration. Never mixed in. */
  allSample: boolean;
  /** Per month, in dollars — the annual offer ÷ 12, summed across positions. */
  perMonth: number;
  /** Accrued so far, promised not paid. */
  accrued: number;
  /** The annual percent across the portfolio, weighted by money. */
  returnPct: number;
};

/**
 * The third ledger: what will be charged without anybody approving it again.
 *
 * A standing allowance — an order marked `Active` — holds nothing. PayPal is
 * not setting a cent aside, so it belongs to neither of the two ledgers above
 * and must never be added to them: saying "you have $15 less today" about a
 * subscription is the same false sentence as counting a released pledge as an
 * investment.
 *
 * But hiding it is the other lie. This is money that *will* leave, on its
 * own, and a financial screen that shows only what is held teaches its reader
 * that nothing else can happen. So it gets its own block, its own wording —
 * *nothing is held* — and its own units: an allowance has no cadence in this
 * data model, so the card prints what the row says and **never invents a
 * "per month"**.
 */
export type StandingCommitment = {
  /** The operator's own words for the order. */
  what: string;
  /** The ceiling, in the currency it is written in. */
  amount: number;
  currency: string;
  /**
   * What has to be true before it runs, or `null` when it runs whenever it
   * can. Printed rather than summarised: a condition this card paraphrased
   * would be a second opinion about a rule the server is the only judge of.
   */
  when: string | null;
};

export type AccountPosition = {
  /** Per currency: what PayPal says is there, split into free and committed. */
  balances: BalanceSplit[];
  /** The figure the card leads with, per currency. One row each, sorted. */
  spendable: Spendable[];
  /** `null` when no order funds a campaign — not a card of zeroes. */
  invested: InvestedPosition | null;
  /** Rows waiting for a human: counted, and never part of any total. */
  awaiting: { count: number; amount: number };
  /** What runs on its own: listed, never summed into either ledger. */
  standing: StandingCommitment[];
};

/**
 * Read the whole position from the same rows the table already holds.
 *
 * Four rules, each of them a way to be quietly wrong:
 *
 * **An order funds a campaign only when it names one.** The grid's own
 * classifier (F3.12·B) asks the same question in the other direction; asking
 * it here too means the ledger and the chart cannot disagree about which
 * rows are positions. A row without a `project` is an ordinary purchase and
 * belongs to the first ledger, not to this one.
 *
 * **`Reserved` appears in both ledgers and is added to neither.** It is the
 * same dollars, seen from two questions: *"what has my balance committed?"*
 * and *"how much is pledged?"*. A caller that adds them has doubled the
 * money, and this module gives it no field to do it with.
 *
 * **A dividend accrues only where the campaign can still pay it** — the same
 * `earnsDividend` rule the portfolio card reads, and only when the campaign
 * is in the showcase the caller passed. A rate recalled from somewhere else
 * is a rate nobody checked.
 *
 * **`Awaiting approval` is counted, never counted *as* money.** It has
 * touched nothing; a reader needs to know it exists because it is the next
 * thing that will leave, and hiding it would make the free figure look
 * permanent.
 *
 * `today` is a parameter so the accrued figure can be pinned by a test rather
 * than by the day the suite runs.
 */
export function accountPosition(
  entries: readonly BalanceEntry[],
  rows: readonly PositionRow[],
  projects: readonly ProjectLike[] = [],
  today: Date = new Date()
): AccountPosition {
  const balances = balanceComposition(entries, rows);

  // The figure the whole card is built to answer. One row per currency: 100
  // USD and 100 PYUSD are not 200 of anything, and a card that printed one
  // number here would be the first place this product broke its own law.
  const spendable: Spendable[] = balances
    .filter((split) => split.free > 0)
    .map((split) => ({ currency: split.currency, value: split.free }));

  const positions = rows.filter(
    (row) => typeof row.project === "string" && row.project.trim().length > 0
  );

  let paid = 0;
  let reserved = 0;
  let returned = 0;
  let perMonth = 0;
  let accrued = 0;
  const rates: Array<{ amountUsd: number; returnPct: number }> = [];

  const byId = new Map(projects.map((project) => [project.id, project]));

  for (const row of positions) {
    const amount = Number.isFinite(row.limit) && row.limit > 0 ? row.limit : 0;

    if (row.status === STATUS.captured) paid += amount;
    else if (row.status === STATUS.reserved) reserved += amount;
    else if (row.status === STATUS.released) returned += amount;

    // An unknown state is not money in any bucket: `Awaiting approval` on a
    // pledge holds nothing yet, and counting it as invested would report a
    // commitment the payer has not made.
    if (!earnsDividend(row)) continue;
    const project = row.project ? byId.get(row.project) : undefined;
    if (!project) continue;

    const dividend = dividendOn(
      { amountUsd: amount, returnPct: project.returnPct, since: row.createdAt ?? row.capturedAt ?? null },
      today
    );
    perMonth += dividend.perMonth;
    accrued += dividend.total;
    rates.push({ amountUsd: amount, returnPct: project.returnPct });
  }

  const invested: InvestedPosition | null =
    positions.length === 0
      ? null
      : {
          paid,
          reserved,
          returned,
          committed: paid + reserved,
          placed: paid + reserved + returned,
          count: positions.length,
          // Every row, and only then. One real pledge replaces the showcase
          // — the two are never merged, which is why this is a boolean of the
          // whole list rather than a per-row flag the card would have to
          // reconcile.
          allSample: positions.every((row) => row.sample === true),
          perMonth,
          accrued,
          returnPct: weightedReturnPct(rates),
        };

  let awaitingCount = 0;
  let awaitingAmount = 0;
  for (const row of rows) {
    if (row.status !== STATUS.pending) continue;
    awaitingCount += 1;
    if (Number.isFinite(row.limit) && row.limit > 0) awaitingAmount += row.limit;
  }

  // What will run by itself. `Active` is the one state that holds nothing and
  // still acts — which is why it needed a third ledger rather than a fourth
  // colour on the first two: it is neither money set aside nor money gone.
  //
  // Sorted by currency then words, so the list does not reorder itself as
  // rows arrive — the same reason every list in this file is sorted.
  const standing: StandingCommitment[] = rows
    .filter((row) => row.status === STATUS.enforced)
    .map((row) => ({
      what: row.what ?? "(unnamed)",
      amount: Number.isFinite(row.limit) && row.limit > 0 ? row.limit : 0,
      currency: row.currency,
      when: row.condition?.trim() ? row.condition.trim() : null,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || a.what.localeCompare(b.what));

  return {
    balances,
    spendable,
    invested,
    awaiting: { count: awaitingCount, amount: awaitingAmount },
    standing,
  };
}

/** True when there is anything on the screen. A card of zeroes explains nothing. */
export function hasPositionFigure(position: AccountPosition): boolean {
  return (
    position.balances.some((split) => split.total > 0) ||
    position.invested !== null ||
    position.awaiting.count > 0 ||
    position.standing.length > 0
  );
}
