// tests/candidate-record.test.ts
//
// What gets written onto a row when the human chooses, and what must not.
//
// These three fields are the audit the product claims and could not previously
// produce: the agent's proposal, the alternatives it was proposed from, and
// what the human took instead. Two rules are worth pinning because both fail
// silently in a way a reader cannot detect — the picture must never be
// promoted from the ~200px thumbnail (a record that looks complete and shows
// nothing), and a price the catalog did not publish must stay `null` rather
// than becoming `0`, which would put an invented figure in a comparison the
// reader takes at face value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateRecord, candidateRecords } from "../lib/commerce/catalog.ts";

const product = {
  id: 42,
  title: "Sports Sneakers Off White & Red",
  description: "A description long enough that storing it per candidate would be wasteful.",
  price: 119.99,
  currency: "USD",
  discountPercentage: 12.5,
  rating: 4.4,
  reviewCount: 120,
  stock: 8,
  availabilityStatus: "In stock",
  category: "mens-shoes",
  brand: "SportZone",
  sku: "SZ-1042",
  shippingInformation: "Ships in 3-5 business days",
  returnPolicy: "30 days",
  warrantyInformation: "1 year",
  thumbnail: "https://cdn.example.com/thumb.jpg",
  images: ["https://cdn.example.com/large-1.jpg", "https://cdn.example.com/large-2.jpg"],
};

test("keeps what a later reader needs, and drops what they do not", () => {
  const record = candidateRecord(product);
  assert.ok(record);

  assert.equal(record.id, 42);
  assert.equal(record.title, "Sports Sneakers Off White & Red");
  assert.equal(record.price, 119.99);
  assert.equal(record.brand, "SportZone");
  assert.equal(record.category, "mens-shoes");
  assert.equal(record.stock, 8);
  assert.equal(record.rating, 4.4);

  // The picture the picker judged by, and only that one: the second image
  // would show a product the approval card never displayed.
  assert.equal(record.image, "https://cdn.example.com/large-1.jpg");
  assert.equal(record.thumbnail, "https://cdn.example.com/thumb.jpg");

  // Reduction, not copy: none of the prose follows the row into storage.
  assert.equal("description" in record, false);
  assert.equal("images" in record, false);
  assert.equal("shippingInformation" in record, false);
});

test("the thumbnail is never promoted to the picture a human decided with", () => {
  const record = candidateRecord({ ...product, images: [] });
  assert.ok(record);
  assert.equal(record.image, null);
  assert.equal(record.thumbnail, "https://cdn.example.com/thumb.jpg");
});

test("a price nobody published is null, never zero", () => {
  const record = candidateRecord({ ...product, price: undefined });
  assert.ok(record);
  assert.equal(record.price, null);

  const notANumber = candidateRecord({ ...product, price: "119.99" });
  assert.ok(notANumber);
  assert.equal(notANumber.price, null);
});

test("without an id it cannot be linked to a choice, so it is not a candidate", () => {
  assert.equal(candidateRecord({ ...product, id: undefined }), null);
  assert.equal(candidateRecord({ ...product, id: "42" }), null);
  assert.equal(candidateRecord(null), null);
  assert.equal(candidateRecord("product"), null);
  assert.equal(candidateRecord([product]), null);
});

test("the list keeps only records that are candidates", () => {
  const kept = candidateRecords([product, null, "junk", { title: "no id" }]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 42);
});

test("a response that is not a list leaves the row with no strip, not with junk", () => {
  assert.deepEqual(candidateRecords(undefined), []);
  assert.deepEqual(candidateRecords({ candidates: [product] }), []);
});
