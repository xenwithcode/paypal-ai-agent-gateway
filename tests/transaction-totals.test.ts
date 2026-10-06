// tests/transaction-totals.test.ts
//
// What came in and what went out, and what happens when a row cannot say.
//
// The case worth protecting is the silent one: a row whose amount cannot be
// read must be reported as uncounted rather than folded in as zero, because a
// total that quietly skipped records looks complete and is wrong in a way no
// reader can see. And the two directions are never combined — a credit and a
// debit added together is arithmetic nobody can use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseTransactions } from "../lib/transactionTotals.ts";

/** One record shaped the way Transaction Search returns an amount. */
function tx(currency: string, value: string): Record<string, unknown> {
  return { transactionInfo: { transactionAmount: { currencyCode: currency, value } } };
}

test("money in and money out are summed separately", () => {
  const summary = summariseTransactions([tx("USD", "5000.00"), tx("USD", "-1.00"), tx("USD", "-0.25")]);

  assert.equal(summary.currencies.length, 1);
  assert.equal(summary.currencies[0].inAmount, 5000);
  assert.equal(summary.currencies[0].outAmount, 1.25, "debits come back as a positive figure");
  assert.equal(summary.currencies[0].counted, 3);
  assert.equal(summary.counted, 3);
  assert.equal(summary.uncounted, 0);
});

test("currencies are never added together", () => {
  // The purchases table on the same page already splits totals by currency for
  // this reason: 10 USD next to 5 PYUSD is not 15 of anything.
  const summary = summariseTransactions([tx("USD", "10.00"), tx("PYUSD", "5.00")]);

  assert.equal(summary.currencies.length, 2);
  assert.deepEqual(summary.currencies.map((entry) => entry.currency), ["USD", "PYUSD"]);
  assert.equal(summary.currencies[0].inAmount, 10);
  assert.equal(summary.currencies[1].inAmount, 5);
});

test("a row with no readable amount is reported, not counted as zero", () => {
  // The one that makes a total trustworthy. Silently skipping these would
  // produce a figure that looks complete and is missing rows.
  const summary = summariseTransactions([
    tx("USD", "10.00"),
    {},
    { transactionInfo: {} },
    { transactionInfo: { transactionAmount: { currencyCode: "USD", value: "not money" } } },
    { transactionInfo: { transactionAmount: { value: "10.00" } } },
  ]);

  assert.equal(summary.counted, 1);
  assert.equal(summary.uncounted, 4);
  assert.equal(summary.currencies[0].inAmount, 10, "the readable row is unaffected");
});

test("a zero amount is counted but moves in neither direction", () => {
  // Zero is a real amount on a real record. Inventing a bucket for it would
  // invent a movement that did not happen.
  const summary = summariseTransactions([tx("USD", "0.00")]);

  assert.equal(summary.counted, 1);
  assert.equal(summary.uncounted, 0);
  assert.equal(summary.currencies[0].inAmount, 0);
  assert.equal(summary.currencies[0].outAmount, 0);
});

test("an empty list is an empty answer, not an error", () => {
  assert.deepEqual(summariseTransactions([]), { currencies: [], counted: 0, uncounted: 0 });
});

test("money arriving as a number as well as a string", () => {
  // The wire carries strings, but a future caller may not, and a total that
  // silently dropped numbers would look like a quiet account.
  const summary = summariseTransactions([
    { transactionInfo: { transactionAmount: { currencyCode: "USD", value: 7 } } },
  ]);
  assert.equal(summary.counted, 1);
  assert.equal(summary.currencies[0].inAmount, 7);
});

test("a fee is reported apart, not folded into the amount", () => {
  // The real account's records: +100.00 with a -5.70 fee and a balance that
  // moved by 94.30. Reporting 100 as what arrived, with no sign of the fee,
  // gives a total that disagrees with the balance it belongs to.
  const summary = summariseTransactions([
    {
      transactionInfo: {
        transactionAmount: { currencyCode: "USD", value: "100.00" },
        feeAmount: { currencyCode: "USD", value: "-5.70" },
      },
    },
  ]);

  const [usd] = summary.currencies;
  assert.equal(usd.inAmount, 100, "the amount is the amount");
  assert.equal(usd.fees, 5.7, "the fee is its own figure, as a magnitude");
  assert.equal(usd.inAmount - usd.fees, 94.3, "and the two reconcile with the balance");
});

test("a fee is a cost however PayPal signs it", () => {
  // Reported negative by convention, but a positive one must not subtract.
  const positive = summariseTransactions([
    {
      transactionInfo: {
        transactionAmount: { currencyCode: "USD", value: "10.00" },
        feeAmount: { currencyCode: "USD", value: "2.00" },
      },
    },
  ]);
  assert.equal(positive.currencies[0].fees, 2);
});

test("a fee with no readable amount still counts as money spent", () => {
  // The amount may be unparseable; the fee is a separate fact and must not be
  // lost with it.
  const summary = summariseTransactions([
    {
      transactionInfo: {
        transactionAmount: { currencyCode: "USD", value: "not money" },
        feeAmount: { currencyCode: "USD", value: "-0.30" },
      },
    },
  ]);

  assert.equal(summary.uncounted, 1, "the amount stays uncounted");
  assert.equal(summary.currencies[0].fees, 0.3, "the fee does not go with it");
  assert.equal(summary.currencies[0].counted, 0, "and no row is credited an amount it did not have");
});

test("a fee in another currency lands in its own entry", () => {
  const summary = summariseTransactions([
    {
      transactionInfo: {
        transactionAmount: { currencyCode: "USD", value: "10.00" },
        feeAmount: { currencyCode: "PYUSD", value: "-0.10" },
      },
    },
  ]);

  assert.deepEqual(summary.currencies.map((entry) => entry.currency), ["USD", "PYUSD"]);
  assert.equal(summary.currencies[1].fees, 0.1);
  assert.equal(summary.currencies[1].counted, 0, "no amount was read in that currency");
});
