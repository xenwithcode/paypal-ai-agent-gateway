// tests/balance-composition.test.ts
//
// The sibling chart's rule. A ring that subtracts a reservation twice, or that
// adds a USD balance to a PYUSD one, looks exactly as convincing as one that
// does not — so the four ways this can be silently wrong are pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceComposition,
  hasComposition,
  type BalanceEntry,
} from "../lib/balanceComposition.ts";
import { STATUS } from "../lib/policy.ts";

const entry = (over: Partial<BalanceEntry> = {}): BalanceEntry => ({
  currency: "USD",
  value: 5000,
  ...over,
});

const row = (over: Partial<{ status: string; limit: number; currency: string }> = {}) => ({
  status: STATUS.reserved,
  limit: 100,
  currency: "USD",
  ...over,
});

test("only a reservation takes money out of the balance", () => {
  const splits = balanceComposition([entry()], [
    row({ status: STATUS.reserved, limit: 100 }),
    row({ status: STATUS.captured, limit: 200 }),
    row({ status: STATUS.released, limit: 300 }),
    row({ status: STATUS.pending, limit: 400 }),
    row({ status: STATUS.enforced, limit: 500 }),
  ]);

  assert.equal(splits.length, 1);
  assert.equal(splits[0].total, 5000);
  assert.equal(splits[0].committed, 100, "a captured order already left; a released one came back");
  assert.equal(splits[0].free, 4900);
});

test("currencies are never added together", () => {
  const splits = balanceComposition(
    [entry({ currency: "USD", value: 5000 }), entry({ currency: "PYUSD", value: 20 })],
    [row({ currency: "USD", limit: 100 }), row({ currency: "PYUSD", limit: 5 })]
  );

  assert.deepEqual(
    splits.map((split) => split.currency),
    ["PYUSD", "USD"],
    "one ring each, sorted so the row does not reorder itself"
  );
  assert.equal(splits.find((s) => s.currency === "USD")?.free, 4900);
  assert.equal(splits.find((s) => s.currency === "PYUSD")?.free, 15);
});

test("a reservation bigger than the balance clamps, never goes negative", () => {
  // Money that left outside this app, or a hold placed before a withdrawal:
  // the honest ring is *all committed*, and the caller can see the overrun.
  const [split] = balanceComposition([entry({ value: 50 })], [row({ limit: 500 })]);

  assert.equal(split.committed, 500);
  assert.equal(split.free, 0, "never a negative slice");
  assert.ok(split.committed > split.total, "and the overrun stays visible");
});

test("nothing is drawn when there is nothing to draw", () => {
  assert.equal(hasComposition([]), false);
  assert.equal(hasComposition(balanceComposition([], [row()])), false, "no balance, no ring");
  assert.equal(hasComposition(balanceComposition([entry()], [row()])), true);

  // A row that is not money does not create a currency of its own.
  const splits = balanceComposition([entry()], [row({ limit: 0 }), row({ limit: Number.NaN })]);
  assert.equal(splits[0].committed, 0);
});
