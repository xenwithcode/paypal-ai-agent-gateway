// tests/money-in-flight.test.ts
//
// The rule behind the one chart on the dashboard.
//
// A chart is unfalsifiable by looking at it: a stacked bar that adds USD to
// PYUSD, or that counts a standing allowance as money set aside, looks exactly
// as convincing as a correct one. These are the four ways it can be silently
// wrong, plus the one that makes the bars jump around for no reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FLIGHT_STATES, hasMoneyInFlight, moneyInFlight } from "../lib/moneyInFlight.ts";
import { STATUS } from "../lib/policy.ts";

const row = (over: Partial<{ status: string; limit: number; currency: string }> = {}) => ({
  status: STATUS.reserved,
  limit: 100,
  currency: "USD",
  ...over,
});

test("the four states are the four the product names", () => {
  assert.deepEqual(FLIGHT_STATES, {
    awaiting: "Awaiting approval",
    reserved: "Reserved",
    captured: "Captured",
    released: "Released",
  });
});

test("currencies are never added together", () => {
  const rows = moneyInFlight([
    row({ currency: "USD", limit: 100, status: STATUS.reserved }),
    row({ currency: "PYUSD", limit: 50, status: STATUS.reserved }),
    row({ currency: "USD", limit: 30, status: STATUS.reserved }),
  ]);

  assert.equal(rows.length, 2, "one bar per currency, not one total");
  const usd = rows.find((r) => r.currency === "USD");
  const pyusd = rows.find((r) => r.currency === "PYUSD");
  assert.equal(usd?.reserved, 130, "same currency adds up");
  assert.equal(pyusd?.reserved, 50, "a different currency is a different number");
  assert.notEqual(usd?.reserved, rows.reduce((sum, r) => sum + r.reserved, 0));
});

test("each state lands in its own bucket", () => {
  const rows = moneyInFlight([
    row({ status: STATUS.pending, limit: 10 }),
    row({ status: STATUS.reserved, limit: 20 }),
    row({ status: STATUS.captured, limit: 40 }),
    row({ status: STATUS.released, limit: 80 }),
  ]);

  assert.deepEqual(rows, [
    { currency: "USD", awaiting: 10, reserved: 20, captured: 40, released: 80 },
  ]);
});

test("a standing allowance holds no money, so it is not in flight", () => {
  // `Active` means "may not be spent beyond the ceiling", not "set aside".
  // Counting it would put money in the chart that was never reserved.
  const rows = moneyInFlight([
    row({ status: STATUS.enforced, limit: 15 }),
    row({ status: STATUS.protecting, limit: 7 }),
    row({ status: "some status from a future version", limit: 9 }),
  ]);

  assert.deepEqual(rows, [], "nothing is in flight when nothing is held");
  assert.equal(hasMoneyInFlight(rows), false);
});

test("a limit that is not money is skipped, not counted as zero", () => {
  const rows = moneyInFlight([
    row({ limit: 0 }),
    row({ limit: -50 }),
    row({ limit: Number.NaN }),
    row({ limit: 25 }),
  ]);

  assert.equal(rows.length, 1, "the bad rows do not create currencies of their own");
  assert.equal(rows[0].reserved, 25, "and they do not change the total");
});

test("an empty table has nothing to draw", () => {
  assert.deepEqual(moneyInFlight([]), []);
  assert.equal(hasMoneyInFlight(moneyInFlight([])), false);
});

test("the axis does not reshuffle as rows come and go", () => {
  // A capture changes a number, not the order of the categories: a bar chart
  // whose labels jump on every action reads as motion that means nothing.
  const first = moneyInFlight([
    row({ currency: "PYUSD" }),
    row({ currency: "USD" }),
    row({ currency: "EUR" }),
  ]).map((r) => r.currency);
  const second = moneyInFlight([
    row({ currency: "EUR" }),
    row({ currency: "PYUSD" }),
    row({ currency: "USD" }),
  ]).map((r) => r.currency);

  assert.deepEqual(first, second);
  assert.deepEqual(first, ["EUR", "PYUSD", "USD"]);
});

test("a captured row leaves the bucket it used to sit in", () => {
  const before = moneyInFlight([row({ status: STATUS.reserved, limit: 60 })])[0];
  const after = moneyInFlight([row({ status: STATUS.captured, limit: 60 })])[0];

  assert.equal(before.reserved, 60);
  assert.equal(before.captured, 0);
  // The money does not appear twice — it moves from one segment to the next.
  assert.equal(after.reserved, 0);
  assert.equal(after.captured, 60);
});
