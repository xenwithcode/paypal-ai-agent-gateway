// tests/grid-columns.test.ts
//
// The columns are read out of the data rather than written by hand, so what
// this file pins is the reading.
//
// Two behaviours matter most and both are the kind a hand-written grid gets
// wrong: sections PayPal returned *empty* must not become columns of `{}`, and
// a field that appears only in the second record must still get a column — a
// grid built from `rows[0]` alone drops it the moment the data disagrees with
// its first row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSON_COL_DEF, columnDefsFor, formatCell } from "../lib/gridColumns.ts";
import type { ColDef, ColGroupDef } from "ag-grid-community";

type AnyCol = Partial<ColDef> & Partial<ColGroupDef> & { children?: (ColDef | ColGroupDef)[] };

/** Depth-first search, because half the columns live inside groups. */
function findColumn(columns: (ColDef | ColGroupDef)[], key: string, field: "colId" | "groupId"): AnyCol | undefined {
  for (const column of columns as AnyCol[]) {
    if (column.children) {
      const hit = findColumn(column.children, key, field);
      if (hit) return hit;
    }
    if (column[field] === key) return column;
  }
  return undefined;
}

function leafIds(columns: (ColDef | ColGroupDef)[]): string[] {
  return (columns as AnyCol[]).flatMap((column) =>
    column.children ? leafIds(column.children) : [column.colId as string]
  );
}

/** A payout, shaped the way Transaction Search returns one. */
const payout = {
  transactionInfo: {
    transactionId: "10890159B0554833L",
    transactionAmount: { currencyCode: "USD", value: "-1.00" },
    transactionStatus: "P",
    endingBalance: { currencyCode: "USD", value: "4997.50" },
  },
  payerInfo: { emailAddress: "probe-receiver@example.com" },
  cartInfo: {},
  // HATEOAS navigation: the same shape on every record, saying nothing about it.
  links: [{ href: "https://api.sandbox.paypal.com/v1/transactions/1", rel: "self" }],
};

test("a nested field becomes a group with a leaf under it", () => {
  const columns = columnDefsFor([payout]);

  const group = findColumn(columns, "transactionInfo", "groupId");
  assert.ok(group, "the outer section is a group, not a flat column");
  assert.equal(group.headerName, "transactionInfo");

  const leaf = findColumn(columns, "transactionInfo.transactionAmount.value", "colId");
  assert.ok(leaf, "the nested value has its own column");
  assert.equal(leaf.field, "transactionInfo.transactionAmount.value");
  assert.equal(
    findColumn(columns, "transactionInfo.transactionAmount", "groupId")?.headerName,
    "transactionAmount",
    "the group header is the key alone — the path lives in the tooltip"
  );
});

test("navigation links never become a column", () => {
  const columns = columnDefsFor([payout]);
  assert.equal(
    leafIds(columns).some((id) => id.includes("links")),
    false,
    "a column of identical hyperlinks is noise with a header on it"
  );
});

test("a section PayPal returned empty is skipped, not shown as {}", () => {
  // Transaction Search names many sections it has nothing to report for. A
  // column whose every cell would be "{}" tells a reader the field exists.
  const columns = columnDefsFor([payout]);
  assert.equal(leafIds(columns).includes("cartInfo"), false);
  assert.equal(findColumn(columns, "cartInfo", "groupId"), undefined);
});

test("an array of objects opens into indexed columns", () => {
  const columns = columnDefsFor([{ items: [{ sku: "A" }, { sku: "B" }] }]);
  // The index is the *header* ("[0]"), but the id is the path as written —
  // `items.0.sku` is what resolves `row.items[0].sku`, which is the point.
  assert.ok(findColumn(columns, "items.0.sku", "colId"), "the first element gets a column");
  assert.ok(findColumn(columns, "items.1.sku", "colId"), "and so does the second");
  assert.equal(findColumn(columns, "items", "groupId")?.children?.length, 2, "one per element");
  assert.equal(findColumn(columns, "items", "groupId")?.children?.[0]?.headerName, "[0]");
});

test("an array of scalars stays a single cell", () => {
  const columns = columnDefsFor([{ currencies: ["USD", "EUR"] }]);
  assert.ok(findColumn(columns, "currencies", "colId"), "kept whole rather than split");
  assert.equal(
    findColumn(columns, "currencies.[0]", "colId"),
    undefined,
    "two strings as two columns tells nobody anything"
  );
});

test("columns come from every record, not only the first", () => {
  // The one that a `rows[0]` implementation fails: a field that shows up
  // later would be invisible for the rest of the table.
  const columns = columnDefsFor([
    { transactionInfo: { transactionStatus: "S" } },
    { transactionInfo: { transactionStatus: "S", transactionSubject: "Probe payout" } },
  ]);
  assert.ok(
    findColumn(columns, "transactionInfo.transactionSubject", "colId"),
    "the second record's field has a column"
  );
});

test("grouped columns stay with their group when one is resized", () => {
  const columns = columnDefsFor([payout]);
  const group = findColumn(columns, "transactionInfo", "groupId");
  assert.equal(group?.marryChildren, true, "transactionAmount must not park beside payerInfo");
});

test("a cell is printed as it arrived", () => {
  assert.equal(formatCell(null), "", "missing is missing, not the string null");
  assert.equal(formatCell(undefined), "");
  assert.equal(formatCell(-1), "-1", "a negative amount is how PayPal marks money leaving");
  assert.equal(formatCell("P"), "P");
  assert.equal(
    formatCell({ currencyCode: "USD", value: "-1.00" }),
    '{"currencyCode":"USD","value":"-1.00"}',
    "JSON rather than [object Object], which would hide that there was anything there"
  );
});

test("the shared column settings never infer a type", () => {
  // AG Grid guesses from the first row, and a string that is absent in the
  // next one becomes a checkbox over data nobody chose to make editable.
  assert.equal(JSON_COL_DEF.cellDataType, false);
  assert.equal(typeof JSON_COL_DEF.valueFormatter, "function");
  assert.equal(JSON_COL_DEF.filter, true);
});

// ─── The order somebody asked for ──────────────────────────────────────────

test("a lead list brings the claimed columns to the front, most important first", () => {
  const columns = columnDefsFor([{ when: 1, amount: 2, reference: 3 }], {
    lead: ["amount", "when"],
  });
  assert.deepEqual(
    columns.map((column) => (column as ColDef).colId),
    ["amount", "when", "reference"],
    "claimed first in the order given, unclaimed after"
  );
});

test("columns nobody claimed keep the order they arrived in", () => {
  // The sort is stable: asking for one column must not shuffle the other
  // forty-three into a new arbitrary order.
  const columns = columnDefsFor([{ z: 1, y: 2, x: 3 }], { lead: ["y"] });
  assert.deepEqual(
    columns.map((column) => (column as ColDef).colId),
    ["y", "z", "x"]
  );
});

test("with no order asked for, nothing is reordered", () => {
  const columns = columnDefsFor([{ z: 1, a: 2 }]);
  assert.deepEqual(columns.map((column) => (column as ColDef).colId), ["z", "a"]);
});

test("a lead entry orders the group it is nested in, and the leaf inside it", () => {
  // One list has to do both jobs: put `transactionInfo` first at the top level
  // and `transactionAmount` first within it. A prefix match is what lets a
  // single entry mean both.
  const columns = columnDefsFor(
    [{ info: { id: "x", amount: 5 }, payer: { name: "Ana" }, ship: { city: "CCS" } }],
    { lead: ["info.amount", "payer.name"] }
  );

  assert.deepEqual(
    columns.map((column) => column.headerName),
    ["info", "payer", "ship"],
    "the group holding the first lead entry comes first"
  );

  const info = columns[0] as ColGroupDef;
  assert.deepEqual(
    (info.children ?? []).map((column) => column.headerName),
    ["amount", "id"],
    "and inside it, the claimed leaf leads while the rest keep their order"
  );
});

test("ordering does not change what the columns are", () => {
  // Reordering must be presentation only: same ids, same fields, same depth.
  const rows = [{ info: { amount: 5, id: "x" } }];
  const plain = leafIds(columnDefsFor(rows));
  const ordered = leafIds(columnDefsFor(rows, { lead: ["info.amount"] }));
  assert.deepEqual([...ordered].sort(), [...plain].sort());
});
