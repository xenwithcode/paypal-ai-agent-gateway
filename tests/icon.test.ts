// tests/icon.test.ts
//
// The favicon, and the one mistake that made it invisible.
//
// `app/icon.svg` carried a comment mentioning AG Grid's `--color-brand-600`.
// XML forbids the sequence `--` inside a comment, so the file was not valid
// XML: opening `/icon.svg` in a browser printed "Double hyphen within
// comment" instead of a picture, and the tab fell back to the default black
// icon — while `tailwind.config.ts` said the brand colour was blue. The
// palette was right, the file was broken, and nothing between them could tell.
//
// A browser did notice, and only by being asked to look. This test is that
// ask, repeated on every run.
//
// It also pins the colour, because "the favicon wears the brand blue" is a
// claim the doc now makes and a claim that silently stopped being true the
// day somebody edits the fill.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const icon = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");

test("the icon is well-formed XML: no comment contains a double hyphen", () => {
  const comments = [...icon.matchAll(/<!--[\s\S]*?-->/g)].map((m) => m[0]);

  // Every comment opens and closes: an unterminated one would swallow the
  // rest of the file, which is how a valid shape becomes an invalid document.
  assert.equal(
    [...icon.matchAll(/<!--/g)].length,
    comments.length,
    "each <!-- has a matching -->"
  );
  assert.equal([...icon.matchAll(/-->/g)].length, comments.length);

  for (const comment of comments) {
    const inner = comment.slice("<!--".length, -"-->".length);
    assert.equal(
      inner.includes("--"),
      false,
      `XML forbids "--" inside a comment. Found it in: ${comment.slice(0, 80)}`
    );
  }
});

test("the icon wears the brand blue, and no colour the palette does not have", () => {
  assert.match(icon, /fill="#0042a1"/, "blue-600 — the brand colour");

  const hexes = [...icon.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
  // One blue, one white. A stray third colour here would be a second palette
  // arriving through the one file nobody reviews.
  assert.deepEqual([...new Set(hexes)].sort(), ["#0042a1", "#ffffff"]);
});

test("the icon is a shield, not a shape that could be anything", () => {
  // The shield outline and the check inside it: the same mark the sidebar
  // chip shows, so the tab and the app are the same product.
  assert.match(icon, /M16 6\.5 24 9\.4/, "shield body");
  assert.match(icon, /m12\.2 15\.9 2\.7 2\.7 5-5\.2/, "the check that says it stopped");
});
