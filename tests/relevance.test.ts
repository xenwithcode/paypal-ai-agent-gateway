// tests/relevance.test.ts
//
// The rule between the catalog's literal answer and the human's actual
// question.
//
// The worked example this suite exists for: "motorcycle riding jacket" in a
// catalog with motorcycles but no jackets returned three motorcycles. Every
// test below is one way that story ends wrong — an absent opinion that
// empties the strip, a verdict that widens it, a contradiction resolved in
// the wrong direction — plus the one that matters most: the honest sentence
// when nothing matched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRelevance, MAX_REASON_CHARS } from "../lib/commerce/relevance.ts";

type Candidate = { id: number; title: string; price: number };

const candidate = (id: number, title: string, price = 100): Candidate => ({ id, title, price });

const jackets = [
  candidate(11, "Generic Motorcycle", 3999.99),
  candidate(12, "Kawasaki Z800", 8999.99),
  candidate(13, "MotoGP CI.H1", 14999.99),
];

test("no verdict keeps every candidate, with no reasons and no note", () => {
  // The ranking call can fail — no credentials, a timeout, a malformed
  // answer — and the strip then falls back to exactly what it was before the
  // judge existed. A missing opinion must never empty the list: the human
  // still chooses, the server still judges whatever they pick.
  const result = applyRelevance(jackets, null, "motorcycle riding jacket");
  assert.deepEqual(
    result.kept.map((product) => product.id),
    [11, 12, 13],
    "the keyword order stands"
  );
  assert.equal(result.dropped, 0);
  assert.equal(result.note, null, "nothing changed, so nothing is announced");
  assert.ok(
    result.kept.every((product) => product.reason === undefined),
    "and no product carries a reason it never received"
  );
});

test("a verdict may only narrow — kept products are the candidates themselves, not new ones", () => {
  const verdict = { noneMatch: false, picks: [{ id: 12, reason: "A ride to work is the ride." }] };
  const result = applyRelevance(jackets, verdict, "a jacket for riding");
  assert.deepEqual(
    result.kept.map((product) => product.id),
    [12]
  );
  assert.equal(result.dropped, 2, "the other two were set aside, and counted");
  assert.equal(result.note, null, "something matched, so there is nothing to explain away");
});

test("an id the catalog did not return is ignored, never believed", () => {
  // The verdict is untrusted input on its way out of a model, the same as
  // the parsed intent. An id nobody returned would otherwise conjure a
  // product card the catalog never described — image, price and all.
  const verdict = {
    noneMatch: false,
    picks: [
      { id: 999, reason: "Sounds jacket-ish." },
      { id: 11, reason: "A jacket-shaped gap in a motorcycle catalog." },
    ],
  };
  const result = applyRelevance(jackets, verdict, "riding jacket");
  assert.deepEqual(
    result.kept.map((product) => product.id),
    [11],
    "only the pick that names a real candidate survives"
  );
});

test("a pick order is the model's order, not the catalog's", () => {
  // Ranking is the whole point of the call: the model says which match is
  // best, and the strip shows them in that order.
  const verdict = {
    noneMatch: false,
    picks: [
      { id: 13, reason: "Second best." },
      { id: 11, reason: "Best." },
    ],
  };
  const result = applyRelevance(jackets, verdict, "riding jacket");
  assert.deepEqual(
    result.kept.map((product) => product.id),
    [13, 11]
  );
});

test("a repeated id shows its product once", () => {
  const verdict = {
    noneMatch: false,
    picks: [
      { id: 11, reason: "A jacket by name." },
      { id: 11, reason: "The same product again." },
    ],
  };
  const result = applyRelevance(jackets, verdict, "riding jacket");
  assert.equal(result.kept.length, 1, "one product, not two cards for one record");
});

test("noneMatch wins over picks that contradict it", () => {
  // A model that says "nothing matches" and then lists matches has not
  // chosen, it has waffled — and the price of guessing wrong here is a
  // human being offered a motorcycle for a jacket. The stricter reading is
  // the one that ships.
  const verdict = {
    noneMatch: true,
    picks: [{ id: 11, reason: "It has wheels, sort of." }],
  };
  const result = applyRelevance(jackets, verdict, "riding jacket");
  assert.deepEqual(result.kept, []);
  assert.equal(result.dropped, 3);
});

test("nothing matching is said out loud, and the sentence names what was asked for", () => {
  const verdict = { noneMatch: true, picks: [] };
  const result = applyRelevance(jackets, verdict, "  motorcycle riding jacket ");
  assert.equal(result.note, 'Nothing in this catalog matches "motorcycle riding jacket" — no candidate was offered.');
  assert.equal(result.dropped, jackets.length, "every literal hit was set aside");
});

test("an empty pick list reads as nothing matched, not as an unexplained empty strip", () => {
  // `noneMatch: false` with no picks is a contradiction the model can make;
  // the strip must not end up blank with the console claiming success.
  const result = applyRelevance(jackets, { noneMatch: false, picks: [] }, "riding jacket");
  assert.deepEqual(result.kept, []);
  assert.notEqual(result.note, null, "a blank strip always arrives with its reason");
});

test("a reason is trimmed, capped, and travels on a copy — never on the catalog's record", () => {
  const verdict = {
    noneMatch: false,
    picks: [{ id: 11, reason: `  ${"x".repeat(MAX_REASON_CHARS + 40)}  ` }],
  };
  const before = jackets[0];
  const result = applyRelevance(jackets, verdict, "riding jacket");

  assert.equal(result.kept[0].reason?.length, MAX_REASON_CHARS, "a caption on a card, not an essay");
  assert.ok(!("reason" in before), "the input record is untouched");
  assert.notEqual(result.kept[0], before, "and the kept product is a copy");
});

test("a pick with no reason keeps the product without pretending it has one", () => {
  const result = applyRelevance(jackets, { noneMatch: false, picks: [{ id: 12, reason: "" }] }, "x");
  assert.equal(result.kept.length, 1);
  assert.ok(
    !("reason" in result.kept[0]) || result.kept[0].reason === undefined,
    "an empty reason is an absent reason, not an empty caption"
  );
});

test("a non-numeric id in the verdict cannot reach the strip", () => {
  const verdict = { noneMatch: false, picks: [{ id: Number.NaN, reason: "..." }] };
  const result = applyRelevance(jackets, verdict, "x");
  assert.deepEqual(result.kept, [], "NaN matches no catalog id");
  assert.notEqual(result.note, null);
});

test("an empty catalog has nothing to judge and says so", () => {
  const result = applyRelevance([], { noneMatch: true, picks: [] }, "anything");
  assert.deepEqual(result.kept, []);
  assert.equal(result.dropped, 0, "nothing was set aside because nothing existed");
  assert.notEqual(result.note, null);
});
