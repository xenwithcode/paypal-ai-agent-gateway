// tests/target-market.test.ts
//
// The two figures of the Target Market appendix, and the sentence beside them.
//
// A chart is unfalsifiable by looking at it: a bar that sums two rails, or an
// axis that clips the tallest bar, looks exactly as convincing as a correct
// one. This appendix has one rule — *no figure without a source a reader can
// follow* — and these are the ways it can be silently broken anyway:
//
//   1. the legend and the bars read two different arrays (they must be one),
//   2. the prose quotes a number the chart does not draw,
//   3. an axis ceiling that was bought to leave room for a label gets moved
//      down to the data's maximum, and the label of the tallest bar — the bar
//      the chart exists to show — is the one clipped,
//   4. the two rails get added together into a total that means nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKET, MARKET_AXIS_MAX, RAIL_COLORS, VOLUME_BY_YEAR } from "../app/(app)/appendices/target-market/marketData.ts";

const page = readFileSync(
  new URL("../app/(app)/appendices/target-market/page.tsx", import.meta.url),
  "utf8"
  // Whitespace-normalised: JSX wraps a sentence across lines, and a figure
  // that is present in the prose but split by a line break is still present.
).replace(/\s+/g, " ");

const figures = readFileSync(
  new URL("../app/(app)/appendices/target-market/MarketFigures.tsx", import.meta.url),
  "utf8"
);

test("the legend and the bars are the same array, in one place", () => {
  // The page prints the legend by hand and the library draws the bars; the
  // only thing keeping them honest is that both import MARKET.
  assert.match(page, /import { MARKET } from "\.\/marketData"/);
  assert.match(figures, /import \{[\s\S]*MARKET[\s\S]*\} from "\.\/marketData"/);
  // And the colour of a bar comes from its row, not from a palette the
  // legend cannot see — otherwise the dot points at the wrong bar.
  assert.match(figures, /itemStyler/);
});

test("the numbers the prose quotes are the numbers the chart draws", () => {
  // The three figures a judge will cross-check between the paragraph and the
  // bar next to it. Each side is free to be edited — which is exactly why
  // they have to be checked against each other rather than trusted.
  const quoted: Array<[number, string]> = [
    [40, "$40,000 million"], // mobile payments · annual volume
    [12, "$12,000"], // untouched fintech credit
    [5, "$5,000 million"], // remittances · 2026 projection
  ];

  for (const [value, phrase] of quoted) {
    const row = MARKET.find((r) => r.value === value);
    assert.ok(row, `no slice drawn at $${value}B`);
    assert.ok(page.includes(phrase), `the prose no longer says ${phrase}`);
    // Billions in the chart, millions in the sentence: the conversion is the
    // whole risk, so it is said out loud here.
    assert.equal(value * 1000, Number(phrase.replace(/[^0-9,]/g, "").replace(/,/g, "")));
  }
});

test("every slice is drawn in its own colour, largest first", () => {
  const fills = MARKET.map((row) => row.fill);
  assert.equal(new Set(fills).size, fills.length, "two rows sharing a colour: the legend dot points at two bars");
  for (const fill of fills) assert.match(fill, /^#[0-9a-f]{6}$/i, `not a colour: ${fill}`);

  for (let i = 1; i < MARKET.length; i++) {
    assert.ok(
      MARKET[i - 1].value >= MARKET[i].value,
      `horizontal bars read top-down: ${MARKET[i - 1].label} is below ${MARKET[i].label}`
    );
  }

  // Each row carries the words a tooltip and a legend row both print — a bar
  // with no note is a number with nothing to check it against.
  for (const row of MARKET) {
    assert.ok(row.label.trim().length > 0);
    assert.ok(row.note.trim().length > 0);
  }
});

test("the ceiling above the data buys room for the tallest label, and only that", () => {
  const tallest = Math.max(...MARKET.map((row) => row.value));
  assert.ok(
    MARKET_AXIS_MAX > tallest,
    "a ceiling at the data's maximum clips the label of the tallest bar — the bar this chart exists to show"
  );
  assert.ok(
    MARKET_AXIS_MAX <= tallest * 1.5,
    "a ceiling far above the data shrinks every bar to fit empty space"
  );
  assert.equal(RAIL_COLORS.mobile, MARKET[0].fill, "the first chart's rail blue is the page's rail blue");
});

test("the two rails are told apart, and are never added together", () => {
  for (const year of VOLUME_BY_YEAR) {
    assert.ok(year.mobile > 0 && year.pos > 0, `${year.year}: a rail with no operations`);
    assert.notEqual(year.mobile, year.pos);
  }

  // The caption claims one rail quadrupled while the other shrank. The claim
  // is only worth printing if the series behind it says the same thing.
  const first = VOLUME_BY_YEAR[0];
  const last = VOLUME_BY_YEAR[VOLUME_BY_YEAR.length - 1];
  assert.ok(last.mobile >= first.mobile * 3, "the growing rail no longer grew");
  assert.ok(last.pos <= first.pos * 0.6, "the shrinking rail no longer shrank");

  // Two series, not one stacked series: stacking hides the comparison inside
  // a total nobody asked for, and the total of two rails means nothing.
  assert.match(figures, /yKey: "mobile"/);
  assert.match(figures, /yKey: "pos"/);
  assert.equal(/\bstack\s*:/.test(figures), false, "the rails are drawn side by side, not stacked");
});
