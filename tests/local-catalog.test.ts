// tests/local-catalog.test.ts
//
// The local half exists for one reason: a judge should be able to ask for a
// motorcycle jacket or a pair of Chelsea boots and see that product, without
// the app pretending a motorcycle is a jacket. These tests pin the bilingual
// matching, the merge with dummyjson, and the exact-id read-back that capture
// depends on.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  LOCAL_PRODUCTS,
  isLocalProduct,
  localProductById,
  searchLocalCatalog,
} from "../lib/commerce/localCatalog.ts";
import { getProduct, searchCandidates } from "../lib/commerce/catalog.ts";

const realFetch = globalThis.fetch;
const FED: { products: Array<{ id: number; title: string; price: number; category?: string }> } = {
  products: [],
};

beforeEach(() => {
  FED.products = [];
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(FED), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a Spanish jacket request finds the local motorcycle jacket", () => {
  const found = searchLocalCatalog("chaqueta para montar moto");
  assert.ok(
    found.some((product) => product.id === 9_001),
    "the bilingual keywords must survive the Spanish request"
  );
});

test("Chelsea boots and a coffee machine are no longer empty searches", () => {
  assert.ok(searchLocalCatalog("Chelsea style boots").some((p) => p.id === 9_003));
  assert.ok(searchLocalCatalog("coffee machine").some((p) => p.id === 9_005));
  assert.ok(searchLocalCatalog("headphones").some((p) => p.id === 9_004));
});

test("the local catalogue does not steal the existing dummyjson searches", () => {
  // These four are the queries pinned by tests/search-candidates.test.ts. If
  // the local half added a hit here, the strip would show a card the old
  // catalogue did not return.
  assert.equal(searchLocalCatalog("spotify premium").length, 0);
  assert.equal(searchLocalCatalog("wireless earphones").length, 0);
  assert.equal(searchLocalCatalog("white sneakers").length, 0);
  assert.equal(searchLocalCatalog("running shoes").length, 0);
});

test("the merge puts a real jacket beside the motorcycles, never instead of them", async () => {
  FED.products = [
    { id: 113, title: "Generic Motorcycle", price: 3999.99, category: "vehicle" },
    { id: 114, title: "Kawasaki Z800", price: 8999.99, category: "vehicle" },
  ];

  const { candidates } = await searchCandidates("chaqueta para montar moto");
  assert.ok(
    candidates.some((candidate) => candidate.id === 9_001),
    "the local jacket must be in the merged shortlist"
  );
  assert.ok(
    candidates.some((candidate) => candidate.id === 113),
    "the motorcycles still reach the relevance judge, which is what rejects them"
  );
});

test("a local id is resolved without a network call", async () => {
  globalThis.fetch = (() => {
    throw new Error("local products must not hit the network");
  }) as typeof fetch;

  const product = await getProduct(9_001);
  assert.equal(product?.title, "Motorcycle Riding Jacket");
  assert.equal(localProductById(9_001)?.id, 9_001);
  assert.equal(isLocalProduct(9_001), true);
  assert.equal(isLocalProduct(91), false);
});

test("every local product ships its own illustration", () => {
  for (const product of LOCAL_PRODUCTS) {
    for (const image of product.images) {
      const file = join(process.cwd(), "public", image.replace(/^\//, ""));
      assert.ok(existsSync(file), `missing ${file}`);
    }
  }
});
