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
import {
  MODE,
  STATUS,
  judgeCharge,
  judgeHoldRequest,
  readExpiry,
  type ChargeAttempt,
  type PolicyEnvelope,
} from "../lib/policy.ts";

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

// ─── The window ────────────────────────────────────────────────────────────

/** A day that has certainly passed, and one that certainly has not. */
const PASSED = "2020-01-01";
const AHEAD = "2099-12-31";

test("an order past its valid-until date may not be charged", () => {
  // The column has always printed a date; this is the first time anything
  // has read it back. It is also the shape a natural-language deadline used
  // to produce — a row born already expired.
  const verdict = judgeCharge(attempt(), transfer({ expires: PASSED }));
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    "This order passed its valid-until date of 2020-01-01, so nothing may be spent against it."
  );
});

test("an order with days left on its window may still be charged", () => {
  const verdict = judgeCharge(attempt(), transfer({ expires: AHEAD }));
  assert.equal(verdict.allowed, true, verdict.reason);
});

test("an empty window means the approver let it run, not that a date went missing", () => {
  const verdict = judgeCharge(attempt(), transfer({ expires: "" }));
  assert.equal(verdict.allowed, true, verdict.reason);
});

test("a valid-until cell that is not a date is refused rather than read as no expiry", () => {
  // "I cannot tell when this ends" must never be read as "this never ends" —
  // the same rule the condition evaluator follows when it cannot answer.
  const verdict = judgeCharge(attempt(), transfer({ expires: "next friday" }));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.violations.length, 1, verdict.reason);
  assert.match(verdict.reason, /is not a date, so the window cannot be judged/);
  assert.match(verdict.reason, /YYYY-MM-DD/);
});

test("the window closes the day after the date it names, not on it", () => {
  // A bare cell carries no timezone, so "valid until the 31st" has to still
  // be valid on the 31st — otherwise every order expires hours early for
  // anyone east of UTC.
  assert.deepEqual(readExpiry("2026-10-31", new Date(2026, 9, 31)), {
    kind: "date",
    iso: "2026-10-31",
    expired: false,
  });
  assert.deepEqual(readExpiry("2026-10-31", new Date(2026, 10, 1)), {
    kind: "date",
    iso: "2026-10-31",
    expired: true,
  });
  assert.deepEqual(readExpiry("2026-10-31", new Date(2026, 9, 30)), {
    kind: "date",
    iso: "2026-10-31",
    expired: false,
  });
});

test("an unreadable window is unreadable, and an empty one is a decision", () => {
  assert.deepEqual(readExpiry("next friday"), { kind: "unreadable", raw: "next friday" });
  assert.deepEqual(readExpiry("  "), { kind: "none" });
  assert.deepEqual(readExpiry(undefined), { kind: "none" });
});

// ─── The autonomy mode ─────────────────────────────────────────────────────

test("a Copilot order refuses a charge the agent started on its own", () => {
  const verdict = judgeCharge(attempt({ initiatedBy: "agent" }), transfer({ mode: MODE.copilot }));
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    "This order runs in Copilot mode, so a human has to approve each charge — this one was started by the agent."
  );
});

test("a Copilot order refuses an attempt that does not show a human", () => {
  // Silence is not consent here either: a mode that exists to require a
  // human cannot read "does not say" as "there was one".
  const verdict = judgeCharge(attempt(), transfer({ mode: MODE.copilot }));
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    "This order runs in Copilot mode, so a human has to approve each charge — and this attempt does not say that one did."
  );
});

test("a Copilot order takes a charge a human put in motion", () => {
  const verdict = judgeCharge(attempt({ initiatedBy: "human" }), transfer({ mode: MODE.copilot }));
  assert.equal(verdict.allowed, true, verdict.reason);
});

test("an Autonomous order takes the agent acting alone — that is what was granted", () => {
  const verdict = judgeCharge(attempt({ initiatedBy: "agent" }), transfer({ mode: MODE.autonomous }));
  assert.equal(verdict.allowed, true, verdict.reason);
});

test("an envelope written before the mode column existed restricts nothing", () => {
  const legacy: PolicyEnvelope = transfer();
  assert.equal(legacy.mode, undefined);
  const verdict = judgeCharge(attempt({ initiatedBy: "agent" }), legacy);
  assert.equal(verdict.allowed, true, verdict.reason);
});

test("a window and a mode are reported alongside the amount, not instead of it", () => {
  const verdict = judgeCharge(
    attempt({ amount: 901, initiatedBy: "agent" }),
    transfer({ expires: PASSED, mode: MODE.copilot })
  );
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.violations.length, 3, verdict.reason);
  assert.match(verdict.reason, /exceeds the 25\.00 USD ceiling/);
  assert.match(verdict.reason, /passed its valid-until date of 2020-01-01/);
  assert.match(verdict.reason, /started by the agent/);
});

// ─── Opening a hold ────────────────────────────────────────────────────────

/** The envelope as an approval card sees it: drafted, not yet approved. */
function drafted(over: Partial<PolicyEnvelope> = {}): PolicyEnvelope {
  return { ...transfer({ status: STATUS.pending }), ...over };
}

test("a drafted order inside its envelope may be opened as a hold", () => {
  const verdict = judgeHoldRequest(attempt({ initiatedBy: "human" }), drafted());
  assert.equal(verdict.allowed, true, verdict.reason);
  assert.equal(verdict.reason, 'Order of 25.00 USD is within "Transfer to ana@example.com".');
});

test("a hold may only be opened against an order awaiting approval", () => {
  // The mirror of the arming rule: charges need the order armed, holds need
  // it not yet armed — because opening the hold is what arms it.
  const verdict = judgeHoldRequest(attempt(), drafted({ status: STATUS.enforced }));
  assert.equal(verdict.allowed, false);
  assert.equal(
    verdict.violations[0],
    "A hold can only be opened against an order awaiting approval — this one is Active."
  );
});

test("an order whose window already closed may not be opened as a hold", () => {
  // The case that used to pass silently: the date was rendered, never read,
  // so a hold could be opened against an order with no time left on it.
  const verdict = judgeHoldRequest(attempt({ initiatedBy: "human" }), drafted({ expires: PASSED }));
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /passed its valid-until date of 2020-01-01/);
});

test("the ceiling applies to the hold as much as to the charge", () => {
  const verdict = judgeHoldRequest(attempt({ amount: 26 }), drafted({ limit: 25 }));
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /exceeds the 25\.00 USD ceiling/);
});

test("the recipient applies before anything is reserved for it", () => {
  const verdict = judgeHoldRequest(
    attempt({ initiatedBy: "human", payee: "mallory@example.com" }),
    drafted()
  );
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /Recipient mallory@example\.com is not allowed/);
});

test("a hold against a Copilot order still has to show the human", () => {
  const refused = judgeHoldRequest(attempt({ initiatedBy: "agent" }), drafted({ mode: MODE.copilot }));
  assert.equal(refused.allowed, false);
  assert.match(refused.reason, /started by the agent/);

  const allowed = judgeHoldRequest(attempt({ initiatedBy: "human" }), drafted({ mode: MODE.copilot }));
  assert.equal(allowed.allowed, true, allowed.reason);
});
