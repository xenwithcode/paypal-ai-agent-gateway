// tests/offer-judgement.test.ts
//
// The seller's side of a trade, judged by the same rules as the buyer's.
//
// The claim this file exists for is the one in the function's own comment: an
// offer and a charge are one question in two seats. Everything except the
// amount is the same judge — window, mode, destination, currency, whether the
// order is armed — and the amount is the mirror image. If the two sides ever
// drift apart, only a test that asks both would notice, which is what the last
// test here does.
//
// The rule with no mirror is the floor: a buyer refuses above a ceiling and
// never below it, and a seller refuses anything that is not the price.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODE, STATUS, judgeCharge, judgeOffer, type OfferTerms } from "../lib/policy.ts";

/** Terms as a seller would publish them: one item, one price, one buyer. */
function terms(over: Partial<OfferTerms> = {}): OfferTerms {
  return {
    what: "Beats Flex Wireless Earphones",
    price: 100,
    currency: "USD",
    buyer: "ana@example.com",
    allowEndpoint: "api.shop.com",
    status: STATUS.enforced,
    mode: MODE.autonomous,
    ...over,
  };
}

const offer = {
  amount: 100,
  currency: "USD",
  buyer: "ana@example.com",
  endpoint: "api.shop.com",
  initiatedBy: "agent" as const,
};

test("an offer at the price, from the named buyer, is accepted", () => {
  const verdict = judgeOffer(offer, terms());
  assert.equal(verdict.allowed, true, verdict.reason);
  assert.equal(
    verdict.reason,
    'Offer of 100.00 USD matches "Beats Flex Wireless Earphones".'
  );
});

test("an offer under the price is refused — the rule with no mirror", () => {
  // What a buyer never does: refuse to pay *less*. What a seller exists to do.
  const verdict = judgeOffer({ ...offer, amount: 95 }, terms());
  assert.equal(verdict.allowed, false);
  assert.match(
    verdict.reason,
    /price of "Beats Flex Wireless Earphones" is 100\.00 USD, and the offer is 95\.00 USD/
  );
});

test("an offer over the price is refused by the shared ceiling rule", () => {
  // Above the price, the judge the buyer's charge goes to speaks first — and
  // with wording that still reads correctly, because a seller's ceiling *is*
  // the price: nothing above it is accepted either.
  const verdict = judgeOffer({ ...offer, amount: 105 }, terms());
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /exceeds the 100\.00 USD ceiling/);
});

test("a payment in another currency cannot be measured against this price", () => {
  const verdict = judgeOffer({ ...offer, currency: "PYUSD" }, terms());
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /Currency mismatch/);
});

test("a buyer outside the published one is refused", () => {
  const verdict = judgeOffer({ ...offer, buyer: "mallory@example.com" }, terms());
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /Recipient mallory@example\.com is not allowed/);
});

test("an offer that names no buyer is refused when one was published", () => {
  // The same asymmetry the charge path has, mirrored: a destination that was
  // named and an attempt that does not reach it are the one to stop.
  const verdict = judgeOffer({ ...offer, buyer: "" }, terms());
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /attempt named no recipient/);
});

test("a Copilot listing refuses an offer the agent brought alone", () => {
  const verdict = judgeOffer(offer, terms({ mode: MODE.copilot }));
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /started by the agent/);
});

test("nothing is accepted against terms that were never published", () => {
  const verdict = judgeOffer(offer, terms({ status: STATUS.pending }));
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /has not been activated yet/);
});

test("an offer past the window is refused before anything else matters", () => {
  const verdict = judgeOffer(offer, terms({ expires: "2020-01-01" }));
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /passed its valid-until date/);
});

test("an offer and a charge are judged by the same rules, not two that agree", () => {
  // The claim, pinned. Equivalent inputs, both seats, identical verdicts: the
  // window, the mode, the destination, the currency and the state are one
  // judge wearing two names. If either side starts answering differently, this
  // is the test that fails — and no amount of reading the code would catch it.
  const sharedTerms = terms({ mode: MODE.copilot, expires: "2020-01-01" });
  const charge = {
    amount: offer.amount,
    currency: offer.currency,
    endpoint: offer.endpoint,
    payee: offer.buyer,
    initiatedBy: offer.initiatedBy,
  };
  const envelope = {
    limit: sharedTerms.price,
    currency: sharedTerms.currency,
    allowEndpoint: sharedTerms.allowEndpoint,
    payee: sharedTerms.buyer,
    what: sharedTerms.what,
    status: sharedTerms.status,
    expires: sharedTerms.expires,
    mode: sharedTerms.mode,
  };

  const fromOffer = judgeOffer(offer, sharedTerms);
  const fromCharge = judgeCharge(charge, envelope);

  assert.equal(fromOffer.allowed, fromCharge.allowed);
  assert.deepEqual(fromOffer.violations, fromCharge.violations);
  // Two of them, and the same two: the window and the mode, in the same order.
  assert.equal(fromOffer.violations.length, 2);
});

test("the floor is the only rule the charge path does not have", () => {
  // The mirror image, both ways: underpay is a seller's refusal and only a
  // seller's; overpay is refused by both, because the price is the ceiling
  // too.
  const under = judgeOffer({ ...offer, amount: 95 }, terms());
  const underAsCharge = judgeCharge(
    // Written out rather than spread from `offer`: that object names its
    // counterparty `buyer` and a charge names it `payee`, and spreading it
    // silently produces a charge with no recipient — which the judge then
    // refuses, correctly, for a reason this test was not about.
    {
      amount: 95,
      currency: "USD",
      endpoint: "api.shop.com",
      payee: "ana@example.com",
      initiatedBy: "agent",
    },
    {
      limit: 100,
      currency: "USD",
      allowEndpoint: "api.shop.com",
      payee: "ana@example.com",
      what: "Beats Flex Wireless Earphones",
      status: STATUS.enforced,
      mode: MODE.autonomous,
    }
  );

  assert.equal(under.allowed, false, "the seller refuses it");
  assert.equal(underAsCharge.allowed, true, "the buyer would have taken it");
  assert.equal(under.violations.length, underAsCharge.violations.length + 1);
});
