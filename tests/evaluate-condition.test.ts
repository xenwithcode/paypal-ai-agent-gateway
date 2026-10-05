// tests/evaluate-condition.test.ts
//
// The rule the whole product rests on: a condition that cannot be answered
// must never read as satisfied. Everything here is about that boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition, type CatalogProduct } from "../lib/commerce/catalog.ts";

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
