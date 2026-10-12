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

const row = (
  over: Partial<{ status: string; limit: number; currency: string; what: string }> = {}
) => ({
  status: STATUS.reserved,
  limit: 100,
  currency: "USD",
  what: "An order",
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
    {
      currency: "USD",
      awaiting: 10,
      reserved: 20,
      captured: 40,
      released: 80,
      members: {
        awaiting: [{ what: "An order", amount: 10 }],
        reserved: [{ what: "An order", amount: 20 }],
        captured: [{ what: "An order", amount: 40 }],
        released: [{ what: "An order", amount: 80 }],
      },
    },
  ]);
});

test("a segment names the rows it is made of", () => {
  // The question hovering a bar actually asks — *which* orders make up this
  // total — which the operator previously had to answer by hand against the
  // table, one row at a time.
  const usd = moneyInFlight([
    row({ what: "Apple AirPods Max Silver", limit: 549.99, status: STATUS.reserved }),
    row({ what: "Nike Air Zoom", limit: 50.01, status: STATUS.reserved }),
    row({ what: "Spotify Premium", limit: 10, status: STATUS.pending }),
  ])[0];

  assert.equal(usd.reserved, 600, "the total is still the total");
  assert.deepEqual(usd.members.reserved, [
    { what: "Apple AirPods Max Silver", amount: 549.99 },
    { what: "Nike Air Zoom", amount: 50.01 },
  ]);
  assert.deepEqual(
    usd.members.reserved.map((member) => member.amount),
    [549.99, 50.01]
  );
  // The names have to add up to the figure they caption, or the tooltip lies
  // with two numbers in the same sentence.
  assert.equal(
    usd.members.reserved.reduce((sum, member) => sum + member.amount, 0),
    usd.reserved
  );
  assert.equal(usd.members.awaiting.length, 1, "and the other segment names its own");
});

test("a capture moves the name with the money", () => {
  const before = moneyInFlight([
    row({ what: "Nike Air Zoom", limit: 60, status: STATUS.reserved }),
  ])[0];
  const after = moneyInFlight([
    row({ what: "Nike Air Zoom", limit: 60, status: STATUS.captured }),
  ])[0];

  assert.deepEqual(before.members.reserved, [{ what: "Nike Air Zoom", amount: 60 }]);
  assert.equal(before.members.captured.length, 0, "it is not in two lists at once");
  assert.equal(after.members.reserved.length, 0);
  assert.deepEqual(after.members.captured, [{ what: "Nike Air Zoom", amount: 60 }]);
});

test("a row nobody named is listed as unnamed, never dropped", () => {
  // Dropping it would make the members add up to less than the total they
  // caption — a tooltip whose two numbers disagree inside one sentence.
  const usd = moneyInFlight([row({ what: "   ", limit: 25 })])[0];
  assert.equal(usd.reserved, 25, "the total still counts it");
  assert.deepEqual(usd.members.reserved, [{ what: "(unnamed)", amount: 25 }]);
});

test("each member carries the id of the row it was summed from", () => {
  // The click. Hovering a segment answers "which orders is this made of";
  // clicking one has to be able to open the order itself, which means the
  // name travelling with the money is not enough — the id has to travel too.
  const usd = moneyInFlight([
    { id: 11, what: "Apple AirPods Max Silver", limit: 549.99, currency: "USD", status: STATUS.reserved },
    { id: 12, what: "Nike Air Zoom", limit: 50.01, currency: "USD", status: STATUS.reserved },
    { id: 13, what: "Spotify Premium", limit: 10, currency: "USD", status: STATUS.pending },
  ])[0];

  assert.deepEqual(
    usd.members.reserved.map((member) => member.id),
    [11, 12],
    "the reserved segment points at the two rows that made it"
  );
  assert.deepEqual(
    usd.members.awaiting.map((member) => member.id),
    [13],
    "and each segment points at its own rows"
  );
});

test("a row without an id is still counted and named, just not clickable", () => {
  // A member carrying `id: undefined` would be a key every reader has to
  // filter around; "no id" is better said by the absence of one. The money
  // and the name are unaffected either way.
  const usd = moneyInFlight([row({ what: "Legacy order", limit: 40 })])[0];
  assert.equal(usd.reserved, 40);
  assert.deepEqual(usd.members.reserved, [{ what: "Legacy order", amount: 40 }]);
  assert.equal("id" in usd.members.reserved[0], false, "the key is absent, not undefined");
});

test("a member's id is the row's own, so a capture moves the id with the money", () => {
  // Same rule as the name: the id follows the row across segments, or a
  // click after a capture would open whichever order used to sit there.
  const before = moneyInFlight([
    { id: 7, what: "Nike Air Zoom", limit: 60, currency: "USD", status: STATUS.reserved },
  ])[0];
  const after = moneyInFlight([
    { id: 7, what: "Nike Air Zoom", limit: 60, currency: "USD", status: STATUS.captured },
  ])[0];

  assert.equal(before.members.reserved[0].id, 7);
  assert.equal(after.members.captured[0].id, 7);
  assert.equal(before.members.captured.length, 0);
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
