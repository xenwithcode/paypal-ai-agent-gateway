// tests/activity-by-type.test.ts
//
// A chart that classifies wrongly is a chart that looks exactly as convincing
// as a correct one: the four ways this can be silently wrong are pinned here —
// the order of the rules, the states that do not count, the currencies that
// must not be summed, and the row that is not money at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_KINDS,
  activityByType,
  activityKindOf,
  hasActivity,
  type ActivityRow,
} from "../lib/activityByType.ts";
import { STATUS } from "../lib/policy.ts";

const settled = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  status: STATUS.captured,
  limit: 100,
  currency: "USD",
  ...over,
});

test("a stake is an investment even though it is also a transfer", () => {
  // Order is the rule: in PayPal's terms a campaign pledge *is* money sent to
  // an account, so asking "is there a payee?" first would file every stake as
  // a transfer and the chart would report the campaign as a payment.
  const stake = { project: "finca-cafe-el-saman", payee: "negocio@example.com", allowEndpoint: "" };
  assert.equal(activityKindOf(stake), "investment");
});

test("a transfer names an account and reaches no endpoint", () => {
  assert.equal(
    activityKindOf({ payee: "ana@example.com", allowEndpoint: "" }),
    "transfer",
    "exactly how /send builds the row"
  );
  assert.equal(
    activityKindOf({ payee: "ana@example.com", allowEndpoint: "api.spotify.com" }),
    "purchase",
    "a host means it reached a catalogue, whoever is paid"
  );
  assert.equal(activityKindOf({}), "purchase", "the fallback is the third case, not a gap");
});

test("only money that moved is counted", () => {
  const rows = activityByType([
    settled({ limit: 100 }),
    settled({ status: STATUS.reserved, limit: 200 }),
    settled({ status: STATUS.released, limit: 300 }),
    settled({ status: STATUS.pending, limit: 400 }),
    settled({ status: STATUS.enforced, limit: 500 }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 100, "a hold is not spending and a return is not spending");
});

test("a row that is not money is skipped, not counted as zero", () => {
  const rows = activityByType([
    settled({ limit: 100 }),
    settled({ limit: 0 }),
    settled({ limit: -50 }),
    settled({ limit: Number.NaN }),
    settled({ currency: "" }),
  ]);

  assert.equal(rows.length, 1, "the bad rows do not create currencies of their own");
  assert.equal(rows[0].total, 100, "and they do not change the total");
});

test("currencies are reported apart and sorted", () => {
  const rows = activityByType([
    settled({ currency: "PYUSD", limit: 25 }),
    settled({ currency: "USD", limit: 60, project: "x" }),
    settled({ currency: "USD", limit: 40, payee: "ana@example.com" }),
    settled({ currency: "USD", limit: 10 }),
  ]);

  assert.deepEqual(
    rows.map((row) => row.currency),
    ["PYUSD", "USD"],
    "never merged, and stable between renders"
  );

  const usd = rows.find((row) => row.currency === "USD");
  assert.equal(usd?.investment, 60);
  assert.equal(usd?.transfer, 40);
  assert.equal(usd?.purchase, 10);
  assert.equal(usd?.total, 110, "the three add up to the figure the bars show");
});

test("every kind is drawn, and nothing is drawn when nothing moved", () => {
  assert.deepEqual([...ACTIVITY_KINDS], ["investment", "transfer", "purchase"]);

  assert.equal(hasActivity([]), false);
  assert.equal(hasActivity(activityByType([settled({ status: STATUS.reserved })])), false);
  assert.equal(hasActivity(activityByType([settled()])), true);
});
