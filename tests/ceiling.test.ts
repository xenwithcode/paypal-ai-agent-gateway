// tests/ceiling.test.ts
//
// The bands the ceiling cell draws, pinned where the rule lives.
//
// Two cases matter most and are the ones a permissive implementation would
// get wrong: a row with no catalog price must not draw a short bar (that
// would invent a figure the row never had), and a price sitting exactly on
// the ceiling is not an overage — the judge's own rule is `>`, not `>=`, and
// the cell agreeing with it is the whole reason this is a rule rather than a
// threshold typed into a component.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ceilingUsage } from "../lib/policy.ts";

test("no price means no bar, not a low one", () => {
  assert.deepEqual(ceilingUsage(100, null), { ratio: null, over: false, band: "none" });
  assert.deepEqual(ceilingUsage(100, undefined), { ratio: null, over: false, band: "none" });
  assert.deepEqual(ceilingUsage(100, Number.NaN), { ratio: null, over: false, band: "none" });
});

test("no ceiling worth dividing by means no bar either", () => {
  assert.deepEqual(ceilingUsage(0, 50), { ratio: null, over: false, band: "none" });
  assert.deepEqual(ceilingUsage(-1, 50), { ratio: null, over: false, band: "none" });
  assert.deepEqual(ceilingUsage(Number.POSITIVE_INFINITY, 50), {
    ratio: null,
    over: false,
    band: "none",
  });
});

test("under seventy percent leaves room", () => {
  const usage = ceilingUsage(100, 69.99);
  assert.equal(usage.band, "low");
  assert.equal(usage.over, false);
  assert.ok(Math.abs((usage.ratio ?? 0) - 0.6999) < 1e-9, String(usage.ratio));
});

test("seventy percent is where the amber starts", () => {
  assert.equal(ceilingUsage(100, 70).band, "near");
});

test("a price sitting exactly on the ceiling is full, not over", () => {
  // The judge refuses `amount > limit`. A cell that coloured 100-of-100 red
  // would be showing a refusal the server would not make.
  const usage = ceilingUsage(100, 100);
  assert.equal(usage.band, "near");
  assert.equal(usage.over, false);
  assert.equal(usage.ratio, 1);
});

test("one cent over is over", () => {
  const usage = ceilingUsage(100, 100.01);
  assert.equal(usage.band, "over");
  assert.equal(usage.over, true);
  assert.equal(usage.ratio, 1, "the bar is capped; the words carry the overage");
});

test("a price three times the ceiling does not run off the cell", () => {
  const usage = ceilingUsage(100, 300);
  assert.equal(usage.over, true);
  assert.equal(usage.ratio, 1);
  assert.equal(usage.band, "over");
});
