// tests/charge-judgement.test.ts
//
// What an order is allowed to do, decided in one place.
//
// `judgeCharge` moved out of /api/policy/check so the rules could be pinned
// without booting a Next server — and so there is only one copy of them. The
// case worth protecting hardest is the recipient rule: an order that names
// who may be paid, and an attempt that says nothing about where it is going.
// That is the one a permissive reading would let through, and it is the one
// the product's own sentence — "the money can only land where you said it
// would" — exists to stop.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS, judgeCharge, type ChargeAttempt, type PolicyEnvelope } from "../lib/policy.ts";

/** A transfer envelope: a ceiling, a recipient, nothing else restricted. */
function transfer(over: Partial<PolicyEnvelope> = {}): PolicyEnvelope {
  return {
    what: "Transfer to ana@example.com",
    limit: 25,
    currency: "USD",
    status: STATUS.enforced,
    allowEndpoint: "",
    payee: "ana@example.com",
    ...over,
  };
}

function attempt(over: Partial<ChargeAttempt> = {}): ChargeAttempt {
  return { amount: 25, currency: "USD", endpoint: "", payee: "ana@example.com", ...over };
}

test("a charge the envelope allows is allowed, and says what it was judged against", () => {
  const verdict = judgeCharge(attempt(), transfer());
  assert.equal(verdict.allowed, true);
  assert.deepEqual(verdict.violations, []);
  assert.equal(verdict.reason, 'Charge of 25.00 USD is within "Transfer to ana@example.com".');
});

test("the ceiling is a ceiling", () => {
  const verdict = judgeCharge(attempt({ amount: 25.01 }), transfer());
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.violations[0], "Amount 25.01 USD exceeds the 25.00 USD ceiling.");
});

test("a charge in another currency cannot be measured against this ceiling", () => {
  const verdict = judgeCharge(attempt({ currency: "PYUSD" }), transfer());
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    "Currency mismatch: the charge is in PYUSD but the ceiling is in USD."
  );
});

test("nothing spends against an order that has not been activated", () => {
  const verdict = judgeCharge(attempt(), transfer({ status: STATUS.pending }));
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    'The policy for "Transfer to ana@example.com" has not been activated yet.'
  );
});

test("a settled order stops permitting charges, and says which state it is in", () => {
  const verdict = judgeCharge(attempt(), transfer({ status: STATUS.captured }));
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    'The policy for "Transfer to ana@example.com" is Captured, so it no longer permits charges.'
  );
});

test("a host outside the allow-list is refused, and the message names both hosts", () => {
  const verdict = judgeCharge(
    attempt({ endpoint: "api.evil.com" }),
    transfer({ allowEndpoint: "api.spotify.com" })
  );
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    "Endpoint api.evil.com is not allowed for this order (only api.spotify.com)."
  );
});

test("no recipient named in the order means no recipient is restricted", () => {
  // The same reading the endpoint rule gives an empty allow-list: absent is
  // not the same as "and nobody may be paid".
  const verdict = judgeCharge(attempt({ payee: "anyone@example.com" }), transfer({ payee: "" }));
  assert.equal(verdict.allowed, true, verdict.reason);
});

test("a recipient outside the order's is refused", () => {
  const verdict = judgeCharge(attempt({ payee: "mallory@example.com" }), transfer());
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    "Recipient mallory@example.com is not allowed for this order (only ana@example.com)."
  );
});

test("an attempt that names no recipient is refused when the order names one", () => {
  // The asymmetry with the endpoint rule, and the reason it is stricter: an
  // endpoint may legitimately be absent because no merchant was named, but a
  // silent destination on a payee-bound order is exactly the attempt to stop.
  const verdict = judgeCharge(attempt({ payee: "" }), transfer());
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    "This order may only pay ana@example.com, and the attempt named no recipient."
  );
});

test("an absent recipient field reads the same as an empty one", () => {
  // Payloads written before this rule existed carry no payee at all; they
  // must not start being judged as an attempt to pay nobody.
  const legacy = { amount: 25, currency: "USD", endpoint: "" } as ChargeAttempt;
  const verdict = judgeCharge(legacy, transfer({ payee: "" }));
  assert.equal(verdict.allowed, true, verdict.reason);
});

test("a named host being absent does not fail the charge, unlike a named payee", () => {
  const verdict = judgeCharge(
    { amount: 25, currency: "USD", payee: "ana@example.com" },
    transfer({ allowEndpoint: "api.spotify.com" })
  );
  assert.equal(verdict.allowed, true, verdict.reason);
});

test("every violation is reported, not only the first", () => {
  const verdict = judgeCharge(
    attempt({ amount: 901, endpoint: "api.evil.com", payee: "mallory@example.com" }),
    transfer({ allowEndpoint: "api.spotify.com" })
  );
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.violations.length, 3, verdict.reason);
  assert.match(verdict.reason, /exceeds the 25\.00 USD ceiling/);
  assert.match(verdict.reason, /Endpoint api\.evil\.com is not allowed/);
  assert.match(verdict.reason, /Recipient mallory@example\.com is not allowed/);
});
