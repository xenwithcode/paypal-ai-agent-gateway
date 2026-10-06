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
import { MAX_BLOCKED, MAX_POLICIES, normaliseSnapshot } from "../lib/store.ts";

const row = { id: 1, what: "Spotify Premium, monthly", limit: 15, currency: "PYUSD" };

test("both arrays pass through as they arrived", () => {
  const snapshot = normaliseSnapshot({ policies: [row], blocked: [{ id: "b1" }] });
  assert.deepEqual(snapshot, { policies: [row], blocked: [{ id: "b1" }] });
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
