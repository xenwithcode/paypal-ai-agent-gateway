// tests/store.test.ts
//
// What the durable copy is allowed to hold.
//
// The case that matters most is the refusal, not the acceptance: a payload
// without `blocked` that read as an empty list would overwrite the ledger of
// every charge that was refused — the record PayPal never sees, and the one
// this product exists to keep. Defaulting a missing array to empty is the
// obvious way to write this function and the wrong one.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCKED_STORAGE_KEY,
  MAX_BLOCKED,
  MAX_POLICIES,
  POLICY_STORAGE_KEY,
  normaliseSnapshot,
  pushToStore,
} from "../lib/store.ts";

const row = { id: 1, what: "Spotify Premium, monthly", limit: 15, currency: "PYUSD" };

test("both arrays pass through as they arrived", () => {
  const snapshot = normaliseSnapshot({ policies: [row], blocked: [{ id: "b1" }] });
  assert.deepEqual(snapshot, { policies: [row], blocked: [{ id: "b1" }] });
});

test("a row carrying the choice is passed through whole, not flattened", () => {
  // The record of who the agent proposed and who the human took sits *inside*
  // the row as a nested list. Validation that rebuilt rows field by field —
  // rather than checking them — would drop that list silently, and the audit
  // would vanish without a single error anywhere.
  const withChoice = {
    ...row,
    matchedId: 91,
    chosenId: 92,
    candidates: [{ id: 91, title: "Sports Sneakers", price: 119.99 }],
  };
  const snapshot = normaliseSnapshot({ policies: [withChoice], blocked: [] });
  assert.deepEqual(snapshot?.policies, [withChoice]);
});

test("two empty arrays is a valid snapshot, not an error", () => {
  // A browser that has done nothing is a real state — it is what a fresh
  // checkout sends — and refusing it would leave the server unable to start.
  assert.deepEqual(normaliseSnapshot({ policies: [], blocked: [] }), {
    policies: [],
    blocked: [],
  });
});

test("a payload without the ledger of refusals is refused, not completed", () => {
  // The one rule this function exists for. Supplying `policies` alone would,
  // under a defaulting reading, write `blocked: []` and erase everything the
  // server stopped.
  assert.equal(normaliseSnapshot({ policies: [row] }), null);
});

test("a payload without the orders is refused too", () => {
  assert.equal(normaliseSnapshot({ blocked: [] }), null);
});

test("something that is not an object at all is refused", () => {
  assert.equal(normaliseSnapshot(null), null);
  assert.equal(normaliseSnapshot(undefined), null);
  assert.equal(normaliseSnapshot("policies"), null);
  assert.equal(normaliseSnapshot(42), null);
  assert.equal(normaliseSnapshot([]), null);
  assert.equal(normaliseSnapshot([row]), null);
});

test("an array that is not made of records is refused", () => {
  // A list of strings would reach a grid that drops what it does not
  // recognise — but the store should not be the thing feeding it that.
  assert.equal(normaliseSnapshot({ policies: ["nope"], blocked: [] }), null);
  assert.equal(normaliseSnapshot({ policies: [], blocked: [null] }), null);
  assert.equal(normaliseSnapshot({ policies: [row], blocked: [[1, 2]] }), null);
});

test("an order list past the cap is refused", () => {
  const many = Array.from({ length: MAX_POLICIES + 1 }, (_, i) => ({ ...row, id: i }));
  assert.equal(normaliseSnapshot({ policies: many, blocked: [] }), null);
});

test("a ledger past the cap is refused", () => {
  const many = Array.from({ length: MAX_BLOCKED + 1 }, (_, i) => ({ id: String(i) }));
  assert.equal(normaliseSnapshot({ policies: [], blocked: many }), null);
});

test("exactly at both caps is accepted — the caps are the limit, not below it", () => {
  const policies = Array.from({ length: MAX_POLICIES }, (_, i) => ({ ...row, id: i }));
  const blocked = Array.from({ length: MAX_BLOCKED }, (_, i) => ({ id: String(i) }));
  const snapshot = normaliseSnapshot({ policies, blocked });
  assert.equal(snapshot?.policies.length, MAX_POLICIES);
  assert.equal(snapshot?.blocked.length, MAX_BLOCKED);
});

// ─── The durable copy catching up ───────────────────────────────────────────
//
// `pushToStore` is exercised here with a window and a fetch rather than with a
// server, because the behaviour under test is not the endpoint: it is what the
// client does when the endpoint does not answer in time. The first PUT of a
// session can outlast the whole timeout in `next dev` — the route is being
// compiled — and without a retry that write is simply lost until something
// else happens to trigger another.
test("a write that is not answered is retried once, and only then reported", async () => {
  const store = new Map<string, string>();
  store.set(POLICY_STORAGE_KEY, "[]");
  store.set(BLOCKED_STORAGE_KEY, "[]");

  const attempts: number[] = [];
  let failures = Infinity; // how many leading calls fail
  const warnings: unknown[][] = [];

  const globals = globalThis as Record<string, unknown>;
  const originalWindow = globals.window;
  const originalFetch = globals.fetch;
  const originalWarn = console.warn;

  globals.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
    // Runs the callback at once: the debounce and the retry delay both become
    // synchronous, so the test measures the retry and not the clock.
    setTimeout: (handler: () => void) => {
      handler();
      return 0;
    },
    clearTimeout: () => undefined,
  };
  globals.fetch = async () => {
    attempts.push(1);
    if (attempts.length <= failures) throw new Error("timeout");
    return {};
  };
  console.warn = (...args: unknown[]) => void warnings.push(args);

  try {
    // One failure, then success: retried, and nobody is told about it.
    failures = 1;
    pushToStore(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(attempts.length, 2, "the first failure is retried once");
    assert.equal(warnings.length, 0, "a retried write is not a reported failure");

    // Never answered: it stops at one retry and says so exactly once.
    attempts.length = 0;
    warnings.length = 0;
    failures = Infinity;
    pushToStore(0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(attempts.length, 2, "one retry, then it stops — never a loop");
    assert.equal(warnings.length, 1, "reported once, not per attempt");
  } finally {
    console.warn = originalWarn;
    if (originalWindow === undefined) delete globals.window;
    else globals.window = originalWindow;
    if (originalFetch === undefined) delete globals.fetch;
    else globals.fetch = originalFetch;
  }
});
