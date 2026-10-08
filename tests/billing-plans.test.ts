// tests/billing-plans.test.ts
//
// What a PayPal plan says about itself, and what it says when it says nothing.
//
// The case worth protecting is the quiet one: `listBillingPlans` answers with
// ids and links unless the request carries `Prefer: return=representation`,
// so a plan can arrive with no `billingCycles` at all. Reading that as a free
// or one-off plan is the mistake this file refuses — a missing cycle comes
// back as `null`, and the sentences say "not in this response" rather than
// putting a number nobody supplied on the screen.
//
// The second is the trial: a plan's first cycle is usually a free trial, and
// pricing a plan by whichever cycle arrives first makes `9.99/month` print as
// `0.00/month`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeCadence,
  describePrice,
  regularCycle,
  summarisePlan,
} from "../lib/billingPlans.ts";

/** The wire format: snake_case, which is what `curl` shows. */
const wire = {
  id: "P-1",
  name: "Netflix — Standard with ads",
  description: "Netflix, monthly subscription.",
  status: "ACTIVE",
  billing_cycles: [
    {
      tenure_type: "REGULAR",
      sequence: 1,
      total_cycles: 0,
      frequency: { interval_unit: "MONTH", interval_count: 1 },
      pricing_scheme: { fixed_price: { value: "9.99", currency_code: "USD" } },
    },
  ],
  payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 },
  create_time: "2026-10-08T13:44:00Z",
};

/** The same plan after the SDK deserializes it: camelCase. */
const sdk = {
  id: "P-1",
  name: "Netflix — Standard with ads",
  description: "Netflix, monthly subscription.",
  status: "ACTIVE",
  billingCycles: [
    {
      tenureType: "REGULAR",
      sequence: 1,
      totalCycles: 0,
      frequency: { intervalUnit: "MONTH", intervalCount: 1 },
      pricingScheme: { fixedPrice: { value: "9.99", currencyCode: "USD" } },
    },
  ],
  paymentPreferences: { autoBillOutstanding: true, paymentFailureThreshold: 2 },
  createTime: "2026-10-08T13:44:00Z",
};

test("both spellings of the same plan read as the same plan", () => {
  assert.deepEqual(summarisePlan(wire), summarisePlan(sdk));
});

test("the price comes from the regular cycle, not the free trial", () => {
  const plan = summarisePlan({
    id: "P-2",
    name: "Trial first",
    status: "ACTIVE",
    billing_cycles: [
      {
        tenure_type: "TRIAL",
        sequence: 1,
        total_cycles: 1,
        frequency: { interval_unit: "DAY", interval_count: 7 },
        pricing_scheme: { fixed_price: { value: "0.00", currency_code: "USD" } },
      },
      {
        tenure_type: "REGULAR",
        sequence: 2,
        total_cycles: 0,
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        pricing_scheme: { fixed_price: { value: "5.99", currency_code: "USD" } },
      },
    ],
  });

  assert.equal(plan.price, "5.99");
  assert.equal(plan.currency, "USD");
  assert.equal(plan.cycleTenure, "REGULAR");
  assert.equal(describeCadence(plan), "every month · until cancelled");
});

test("a plan priced by its trial is possible, and says so rather than hiding it", () => {
  const plan = summarisePlan({
    id: "P-3",
    billing_cycles: [
      {
        tenure_type: "TRIAL",
        sequence: 1,
        total_cycles: 1,
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        pricing_scheme: { fixed_price: { value: "1.00", currency_code: "USD" } },
      },
    ],
  });

  // No regular cycle exists, so the last one is used — and its tenure is
  // carried with the price, because a trial price is not what the plan costs.
  assert.equal(plan.cycleTenure, "TRIAL");
  assert.equal(plan.price, "1.00");
});

test("no billing cycle in the response means no price, not a free plan", () => {
  // What `return=minimal` returns: ids, status and links.
  const plan = summarisePlan({ id: "P-4", status: "CREATED", links: [] });

  assert.equal(plan.price, null);
  assert.equal(plan.currency, null);
  assert.equal(plan.interval, null);
  assert.equal(plan.totalCycles, null);
  assert.equal(describePrice(plan), "no price in this response");
  assert.equal(describeCadence(plan), "no billing cycle in this response");
});

test("zero cycles is until-cancelled, not a plan that stops at once", () => {
  const plan = summarisePlan(wire);
  assert.equal(plan.totalCycles, 0);
  assert.equal(describeCadence(plan), "every month · until cancelled");
});

test("a counted plan says how many cycles it runs", () => {
  const plan = summarisePlan({
    id: "P-5",
    billing_cycles: [
      {
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 12,
        frequency: { interval_unit: "MONTH", interval_count: 3 },
        pricing_scheme: { fixed_price: { value: "20", currency_code: "USD" } },
      },
    ],
  });

  assert.equal(describeCadence(plan), "every 3 months · 12 cycles");
  assert.equal(describePrice(plan), "20 USD");
});

test("regularCycle returns null when there is no cycle to pick", () => {
  // The cycle, not the plan: it carries the price and the tenure, and it is
  // the record whose absence a plan must admit rather than paper over.
  assert.equal(regularCycle(wire)?.tenure_type, "REGULAR");
  assert.equal(regularCycle({}), null);
  assert.equal(regularCycle({ billing_cycles: "not a list" }), null);
});

test("nothing that reaches summarisePlan throws, and nothing is invented", () => {
  for (const input of [null, undefined, "P-1", 42, [], { billing_cycles: [null, "x"] }]) {
    const plan = summarisePlan(input);
    assert.equal(plan.price, null);
    assert.equal(plan.interval, null);
    assert.equal(plan.name, "");
  }
});
