// tests/evaluate-condition.test.ts
//
// The rule the whole product rests on: a condition that cannot be answered
// must never read as satisfied. Everything here is about that boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition, scheduleFrom, type CatalogProduct } from "../lib/commerce/catalog.ts";
import { calendarDay } from "../lib/policy.ts";

/** A product that exists in the demo catalog, overridable per case. */
function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 91,
    title: "Sports Sneakers Off White & Red",
    description: "",
    price: 119.99,
    currency: "USD",
    discountPercentage: 4.97,
    rating: 4.77,
    reviewCount: 3,
    stock: 17,
    availabilityStatus: "In Stock",
    category: "mens-shoes",
    brand: "Off White",
    sku: "MEN-OFF-SPO-091",
    shippingInformation: "Ships in 3-5 business days",
    returnPolicy: "30 days return policy",
    warrantyInformation: "1 week warranty",
    thumbnail: "https://cdn.dummyjson.com/x/thumbnail.webp",
    images: [],
    ...overrides,
  };
}

test("no condition means it executes immediately", () => {
  const result = evaluateCondition("", product());
  assert.equal(result.met, true);
  assert.match(result.detail, /No condition/);
});

test("no catalog match leaves the condition unverified, never satisfied", () => {
  const result = evaluateCondition("price <= 60", null);
  assert.equal(result.met, null);
  assert.match(result.detail, /No catalog match/);
});

test("price <= holds when the price is under the threshold", () => {
  assert.equal(evaluateCondition("price <= 130", product()).met, true);
  assert.equal(evaluateCondition("price <= 119.99", product()).met, true, "equal counts as <= ");
});

test("price <= fails when the price is over the threshold", () => {
  const result = evaluateCondition("price <= 100", product());
  assert.equal(result.met, false);
  assert.match(result.detail, /119\.99/);
  assert.match(result.detail, /<= 100/);
});

test("every operator is honoured", () => {
  assert.equal(evaluateCondition("price > 100", product()).met, true);
  assert.equal(evaluateCondition("price > 119.99", product()).met, false);
  assert.equal(evaluateCondition("price < 119.99", product()).met, false);
  assert.equal(evaluateCondition("price >= 119.99", product()).met, true);
  assert.equal(evaluateCondition("price = 119.99", product()).met, true);
  assert.equal(evaluateCondition("price == 119.99", product()).met, true);
  assert.equal(evaluateCondition("price = 120", product()).met, false);
});

test("thresholds with separators and decimals are parsed, not mangled", () => {
  assert.equal(evaluateCondition("price <= 1,000.50", product()).met, true);
  assert.equal(evaluateCondition("price <= 100.00", product()).met, false);
});

test("a condition the parser cannot read is unverified, not satisfied", () => {
  // `abc` never matches the numeric pattern, so it falls through to the
  // general "cannot evaluate" answer rather than the threshold guard below.
  const result = evaluateCondition("price <= abc", product());
  assert.equal(result.met, null, "an unreadable condition must never read as passed");
  assert.match(result.detail, /not one this build can evaluate/);
});

test("a threshold that parses to nothing cannot be judged", () => {
  // Matches the numeric pattern but does not evaluate to a number — a typo
  // such as two decimals. Treating it as 0 would silently mark every price
  // as failing the ceiling.
  const result = evaluateCondition("price <= 1.2.3", product());
  assert.equal(result.met, null);
  assert.match(result.detail, /not a number/);
});

test("in stock requires both stock and the catalog's own status", () => {
  assert.equal(evaluateCondition("in stock", product({ stock: 17 })).met, true);
  assert.equal(evaluateCondition("in stock", product({ stock: 0 })).met, false);
  assert.equal(
    evaluateCondition("in stock", product({ stock: 5, availabilityStatus: "Out of Stock" })).met,
    false,
    "the catalog's status has to agree with the count"
  );
  assert.equal(evaluateCondition("available", product()).met, true);
});

test("an unsupported condition is unverified rather than assumed", () => {
  const result = evaluateCondition("ships before friday", product());
  assert.equal(result.met, null);
});

// ─── A schedule ────────────────────────────────────────────────────────────

test("a date in the past is due, and says which day it became due", () => {
  const result = evaluateCondition("on 2000-01-01", null);
  assert.equal(result.met, true);
  assert.match(result.detail, /Due since 2000-01-01/);
});

test("a date in the future is not due yet", () => {
  const result = evaluateCondition("on 2999-12-31", null);
  assert.equal(result.met, false);
  assert.equal(result.detail, "Due on 2999-12-31");
});

test("the day itself counts as due — the payment is due *on* it", () => {
  const result = evaluateCondition(`on ${calendarDay()}`, null);
  assert.equal(result.met, true, "the due day is the day it happens");
  assert.match(result.detail, /Due since/);
});

test("a schedule needs no catalog, because it compares the clock", () => {
  // The rule this operator exists for. Most bills are for services in no
  // catalog at all, and reaching the "no match" answer would refuse them for
  // having nothing to compare a *price* against — which is not the question
  // being asked.
  const withProduct = evaluateCondition("on 2000-01-01", product());
  const withoutProduct = evaluateCondition("on 2000-01-01", null);
  assert.equal(withoutProduct.met, true, "no product, and it still answers");
  assert.equal(withoutProduct.met, withProduct.met, "and the same answer either way");
});

test("a schedule that is not a date is unverified rather than unscheduled", () => {
  // The boundary the whole file is about, applied to a new operator: an
  // unreadable date must not read as "no date", because that would let it
  // settle immediately.
  const result = evaluateCondition("on tomorrow", null);
  assert.equal(result.met, null);
  assert.match(result.detail, /is not a date/);
  assert.match(result.detail, /YYYY-MM-DD/);
});

test("the list reads the same date the evaluator does", () => {
  // One expression, one parser: a list that parsed the date its own way would
  // be the two copies of a rule that eventually disagree.
  assert.equal(scheduleFrom("on 2026-11-01"), "2026-11-01");
  assert.equal(scheduleFrom("  on 2026-11-01  "), "2026-11-01");
  assert.equal(scheduleFrom("on tomorrow"), null, "not a date, so not a schedule");
  assert.equal(scheduleFrom("price <= 60"), null, "a price condition is not a schedule");
  assert.equal(scheduleFrom(""), null);
  assert.equal(scheduleFrom(undefined), null);
});
