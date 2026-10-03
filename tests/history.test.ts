// tests/history.test.ts
//
// A purchase history is the one place where a record you cannot read is
// indistinguishable from a real transaction, so most of what is pinned here
// is about what gets dropped rather than what gets shown.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCKED_STORAGE_KEY,
  POLICY_STORAGE_KEY,
  formatDate,
  formatMoney,
  readBlockedAttempts,
  readPolicyRows,
  readPurchases,
  recordBlocked,
  totalsByCurrency,
} from "../lib/history.ts";

// The module only touches storage inside its functions, so a stub installed
// here is enough — and the same stub `node --experimental-strip-types` gives
// us without jsdom.
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const store = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => void store.set(key, value),
};
(globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: storage };

function writeRows(rows: unknown): void {
  storage.setItem(POLICY_STORAGE_KEY, JSON.stringify(rows));
}

beforeEach(() => store.clear());

// ─── Purchases ─────────────────────────────────────────────────────────────

test("a first-time visitor sees the seeded history, all of it marked", () => {
  const purchases = readPurchases();
  assert.equal(purchases.length, 5, "five examples to look at before any exist");
  assert.ok(purchases.every((p) => p.sample === true));
  assert.equal(purchases[0].amount, 549.99, "prices come from the catalog, not from guesswork");
  assert.ok(purchases[0].thumbnail, "every sample has an image");
  assert.ok(purchases[0].when, "every sample is dated");
});

test("only captured orders count as purchases", () => {
  writeRows([
    { id: 1, what: "Active one", status: "Active", limit: 10, currency: "USD" },
    { id: 2, what: "Drafted one", status: "Awaiting approval", limit: 20, currency: "USD" },
    { id: 3, what: "Held one", status: "Reserved", limit: 30, currency: "USD" },
    { id: 4, what: "Released one", status: "Released", limit: 40, currency: "USD" },
    { id: 5, what: "Captured one", status: "Captured", limit: 50, currency: "PYUSD" },
  ]);

  const purchases = readPurchases();
  const live = purchases.filter((p) => !p.sample);
  assert.equal(live.length, 1, "one order actually settled");
  assert.equal(live[0].what, "Captured one");
  assert.equal(live[0].amount, 50);
  assert.equal(live[0].currency, "PYUSD");
});

test("captured orders come before the seeded ones", () => {
  writeRows([
    { id: 7, what: "Captured one", status: "Captured", limit: 50, currency: "USD" },
  ]);
  const purchases = readPurchases();
  assert.equal(purchases[0].sample, false, "the operator's own capture leads the list");
  assert.equal(purchases.filter((p) => !p.sample).length, 1);
});

test("capturing a product the seed also lists replaces it rather than duplicating", () => {
  writeRows([
    {
      id: 9,
      what: "Apple AirPods Max Silver",
      status: "Captured",
      limit: 549.99,
      currency: "USD",
    },
  ]);
  const purchases = readPurchases();
  const matching = purchases.filter((p) => p.what === "Apple AirPods Max Silver");
  assert.equal(matching.length, 1, "the same product must not appear twice");
  assert.equal(matching[0].sample, false, "and the real one wins");
});

test("unrelated rows in storage never become purchases", () => {
  writeRows([{ id: 12, what: "half written" }, "not an object", 42, null]);
  const purchases = readPurchases();
  assert.ok(purchases.every((p) => p.sample === true), "only the seeds remain");
});

// ─── Refusals ──────────────────────────────────────────────────────────────

test("seeded refusals exist so the ledger is never a blank promise", () => {
  const blocked = readBlockedAttempts();
  assert.equal(blocked.length, 2);
  assert.ok(blocked.every((b) => b.sample === true));
  assert.match(blocked[0].reason, /exceeds the \d+\.\d{2} PYUSD ceiling/);
});

test("a refusal the server actually made is recorded and listed first", () => {
  recordBlocked({
    what: "LATAM flight to Rio",
    amount: 901,
    currency: "PYUSD",
    endpoint: "api.unapproved-latam.com",
    reason: "Amount 901.00 PYUSD exceeds the 900.00 PYUSD ceiling.",
  });

  const blocked = readBlockedAttempts();
  assert.equal(blocked.length, 3);
  assert.equal(blocked[0].sample, false, "the real refusal leads");
  assert.equal(blocked[0].amount, 901);
  assert.ok(blocked[0].when, "and it is dated");
  assert.ok(blocked[0].id, "with an id that did not require a secure context");
});

test("stored refusals without a reason or amount are dropped", () => {
  storage.setItem(BLOCKED_STORAGE_KEY, JSON.stringify([{ what: "broken" }, { reason: "no amount" }]));
  const live = readBlockedAttempts().filter((b) => !b.sample);
  assert.equal(live.length, 0, "an unreadable refusal must not read as a real one");
});

test("the ledger is bounded so it cannot grow without end", () => {
  for (let i = 0; i < 60; i += 1) {
    recordBlocked({
      what: `Order ${i}`,
      amount: i,
      currency: "USD",
      endpoint: "api.example.com",
      reason: `Amount ${i}.00 USD exceeds the ceiling.`,
    });
  }
  const stored = JSON.parse(storage.getItem(BLOCKED_STORAGE_KEY) ?? "[]");
  assert.equal(stored.length, 50, "capped at 50");
  assert.equal(readBlockedAttempts().filter((b) => !b.sample).length, 50);
});

// ─── Manifests ─────────────────────────────────────────────────────────────

test("empty storage reads as an empty list, not an error", () => {
  assert.deepEqual(readPolicyRows(), []);
});

test("a row missing the fields that define an order is dropped", () => {
  writeRows([
    { id: 1, what: "Spotify Premium, monthly", merchant: "Spotify", limit: 15, currency: "PYUSD", status: "Active" },
    { id: 2, what: "corrupto" }, // no ceiling, no currency, no status
    { id: 3, what: "   ", limit: 10, currency: "USD", status: "Active" }, // blank subject
    { id: 4, what: "NaN ceiling", limit: Number.NaN, currency: "USD", status: "Active" },
    { id: 5, what: "No status", limit: 10, currency: "USD" },
  ]);

  const rows = readPolicyRows();
  assert.equal(rows.length, 1, "one valid manifest");
  assert.equal(rows[0].what, "Spotify Premium, monthly");
  assert.equal(rows[0].limit, 15);
  assert.equal(rows[0].currency, "PYUSD");
  assert.equal(rows[0].status, "Active");
});

// ─── Formatting ────────────────────────────────────────────────────────────

test("totals are grouped per currency, never summed across them", () => {
  const purchases = [
    { id: "a", when: "", what: "", merchant: "", amount: 100, currency: "USD", condition: "", endpoint: "", thumbnail: null, sample: false },
    { id: "b", when: "", what: "", merchant: "", amount: 50, currency: "USD", condition: "", endpoint: "", thumbnail: null, sample: false },
    { id: "c", when: "", what: "", merchant: "", amount: 25, currency: "PYUSD", condition: "", endpoint: "", thumbnail: null, sample: false },
  ];

  const totals = totalsByCurrency(purchases);
  assert.equal(totals.length, 2, "two separate currencies");
  const usd = totals.find((t) => t.currency === "USD");
  const pyusd = totals.find((t) => t.currency === "PYUSD");
  assert.equal(usd?.total, 150);
  assert.equal(usd?.count, 2);
  assert.equal(pyusd?.total, 25);
  assert.equal(pyusd?.count, 1);
  assert.equal(totals[0].currency, "USD", "largest first");
});

test("an unusable date prints as absent rather than as a wrong one", () => {
  assert.equal(formatDate(""), "—");
  assert.equal(formatDate("not a date"), "—");
  assert.match(formatDate(new Date().toISOString()), /^\d{2} \w{3} \d{4}$/);
});

test("money always carries two decimals", () => {
  assert.equal(formatMoney(9, "USD"), "9.00 USD");
  assert.equal(formatMoney(549.99, "PYUSD"), "549.99 PYUSD");
});
