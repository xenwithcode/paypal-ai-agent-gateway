// tests/search-candidates.test.ts
//
// The picker exists because a ranking used to be kept to itself, so what has
// to be pinned is the ranking's honesty rather than its pixels: nothing that
// overlaps with the request produces no candidates at all, the catalog is
// asked for three and returns what it has rather than being padded to three,
// and the first candidate is always the one the single match would have
// taken — the strip and the card must never disagree about the winner.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { searchCandidates, matchProduct } from "../lib/commerce/catalog.ts";

/** Raw as the catalog returns it: `normalise` is what has to survive it. */
type RawProduct = { id: number; title: string; price: number; category?: string };

const FED: { products: RawProduct[] } = { products: [] };

const realFetch = globalThis.fetch;

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

function item(id: number, title: string, price: number, category = "mens-shoes"): RawProduct {
  return { id, title, price, category };
}

test("nothing overlapping with the request means no candidates, not the first row", () => {
  // The rule that stops a sofa standing in for "spotify premium". The strip
  // would otherwise be the loudest place to show a match that is not one.
  FED.products = [item(1, "Velvet sofa", 499.99, "furniture")];

  return searchCandidates("spotify premium").then(({ candidates }) => {
    assert.equal(candidates.length, 0);
  });
});

test("fewer results than asked for are shown as fewer, never padded to three", () => {
  FED.products = [item(107, "Beats Flex Wireless Earphones", 49.99, "mobile-accessories")];

  return searchCandidates("wireless earphones", 3).then(({ candidates }) => {
    assert.equal(candidates.length, 1, "one result is one card, and the heading says so");
    assert.equal(candidates[0].id, 107);
    // Present regardless of how many came back: the card needs a picture it
    // can actually judge, and the field is defaulted rather than optional.
    assert.deepEqual(candidates[0].images, []);
  });
});

test("the strip and the single match agree on the winner", () => {
  FED.products = [
    item(91, "Sports Sneakers Off White", 119.99),
    item(92, "Sneakers Blue Cheap", 79.99),
    item(1, "Velvet sofa", 499.99, "furniture"),
  ];

  return (async () => {
    const { candidates } = await searchCandidates("white sneakers", 3);
    const { product } = await matchProduct("white sneakers");

    assert.equal(candidates.length, 2, "both sneakers stay and the sofa does not");
    assert.ok(
      candidates.every((c) => c.id !== 1),
      "a candidate with no terms in common is dropped before it is offered"
    );
    assert.equal(
      candidates[0]?.id,
      product?.id,
      "candidates[0] must be what matchProduct would have picked"
    );
  })();
});

test("a limit is respected rather than showing everything the fallback returned", () => {
  FED.products = [
    item(1, "Alpha running shoes", 50),
    item(2, "Beta running shoes", 60),
    item(3, "Gamma running shoes", 70),
    item(4, "Delta running shoes", 80),
  ];

  return searchCandidates("running shoes", 3).then(({ candidates }) => {
    assert.equal(candidates.length, 3);
  });
});
