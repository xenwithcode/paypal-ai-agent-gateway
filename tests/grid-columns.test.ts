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
import { JSON_COL_DEF, columnDefsFor, flattenRecord, formatCell } from "../lib/gridColumns.ts";
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

/** How many header rows this set of columns would ask AG Grid for. */
function headerRows(columns: (ColDef | ColGroupDef)[]): number {
  return Math.max(
    ...columns.map((column) =>
      "children" in column && column.children ? 1 + headerRows(column.children) : 1
    )
  );
}

test("a branch deeper than the header is joined instead of adding a row", () => {
  // PayPal nests five deep in places. AG Grid draws one header row for the
  // deepest branch in the table, so without this rule one `cartInfo` line
  // bought a 241px header with two blank rows under every other column.
  const columns = columnDefsFor([
    { cartInfo: { itemDetails: [{ itemPrice: { value: "10.00", currencyCode: "USD" } }] } },
    { transactionInfo: { transactionAmount: { value: "1.00" } } },
  ]);

  assert.equal(headerRows(columns), 3, "three rows: a section, a field, a value");

  const leaf = findColumn(columns, "cartInfo.itemDetails.0.itemPrice.value", "colId");
  assert.ok(leaf, "the deep value keeps its full path — that is what reads it");
  assert.equal(leaf.field, "cartInfo.itemDetails.0.itemPrice.value");
  assert.equal(
    leaf.headerName,
    "[0].itemPrice.value",
    "and the header says what was given up to fit"
  );
});

test("a column of numbers is read as numbers, a column of identifiers is not", () => {
  const columns = columnDefsFor([
    {
      transactionInfo: {
        transactionAmount: { value: "149.99" },
        transactionId: "5XY12345AB6789012",
      },
      postalCode: "28013",
    },
  ]);

  const amount = findColumn(columns, "transactionInfo.transactionAmount.value", "colId");
  assert.equal(amount?.type, "numericColumn", "money lines up on the right");
  assert.equal(
    amount?.cellClass,
    "text-right tabular-nums",
    "and its decimals land in one column — the class is written out because a colDef's cellClass replaces the type's"
  );
  assert.ok(
    (amount?.comparator as (a: unknown, b: unknown) => number)("9.00", "1250.00") < 0,
    "nine is less than twelve hundred, whatever the strings say"
  );

  assert.equal(
    findColumn(columns, "transactionInfo.transactionId", "colId")?.type,
    undefined,
    "an identifier with digits in it stays text"
  );
  assert.equal(
    findColumn(columns, "postalCode", "colId")?.type,
    undefined,
    "a column of whole numbers is a postcode, not money"
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

// ─── One record, read top to bottom ────────────────────────────────────────

test("a scalar becomes a label and a value", () => {
  const nodes = flattenRecord({ transactionId: "4C731322JC300130E" });
  assert.deepEqual(nodes, [
    { kind: "field", key: "transactionId", value: "4C731322JC300130E" },
  ]);
});

test("numbers and booleans arrive as the words a reader can read", () => {
  // The grid formats cells itself; this lays them out, and String() is what
  // keeps `5000` from rendering as an object or a formatted date.
  const nodes = flattenRecord({ value: -1.00, active: true });
  assert.deepEqual(
    nodes.map((node) => (node.kind === "field" ? node.value : node.kind)),
    ["-1", "true"]
  );
});

test("a nested object becomes a group with its own children", () => {
  const nodes = flattenRecord({
    transactionInfo: { transactionId: "X", transactionAmount: { value: "5000.00" } },
  });

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].kind, "group");
  const group = nodes[0] as Extract<(typeof nodes)[number], { kind: "group" }>;
  assert.equal(group.key, "transactionInfo");
  assert.deepEqual(
    group.children.map((child) => child.kind),
    ["field", "group"],
    "the id is a field, the amount is a group under it"
  );
});

test("navigation links are skipped", () => {
  // Same rule as the columns: HATEOAS repeats identically on every record.
  const nodes = flattenRecord({ links: [{ href: "https://api.sandbox.paypal.com", rel: "self" }] });
  assert.deepEqual(nodes, []);
});

test("a section left empty here leaves no heading either", () => {
  // The rule this whole view exists for. A heading with nothing under it reads
  // as "this field is blank", and blank is not the same fact as "was never
  // here for this record".
  const nodes = flattenRecord({ cartInfo: {}, transactionSubject: "Probe" });
  assert.deepEqual(
    nodes.map((node) => node.key),
    ["transactionSubject"],
    "the empty section disappears instead of announcing itself"
  );
});

test("blank values are omitted rather than printed as nothing", () => {
  const nodes = flattenRecord({ a: null, b: "", c: undefined, d: "kept" });
  assert.deepEqual(
    nodes.map((node) => node.key),
    ["d"]
  );
});

test("a section another record fills but this one does not is absent", () => {
  // The cross-record rule, stated as the two sides of it: the columns keep the
  // field because someone has it, and the detail drops it because this record
  // does not. Same input family, opposite and both correct answers.
  const withShipping = flattenRecord({ shippingInfo: { name: "John" } });
  const withoutShipping = flattenRecord({ shippingInfo: {} });
  assert.equal(withShipping.length, 1, "the record that has it shows it");
  assert.equal(withoutShipping.length, 0, "the record that does not, does not");
});

test("an array of objects opens as indexed groups", () => {
  const nodes = flattenRecord({ items: [{ sku: "A" }, { sku: "B" }] });
  assert.equal(nodes.length, 1);
  const group = nodes[0] as Extract<(typeof nodes)[number], { kind: "group" }>;
  assert.deepEqual(
    group.children.map((child) => child.key),
    ["[0]", "[1]"]
  );
});

test("an array of scalars becomes one field, as it becomes one cell", () => {
  // The same decision the columns make, reached the same way: two strings as
  // two lines would tell nobody anything, and one rule in one module is one
  // rule to keep agreeing. This test failed the first time it ran because the
  // detail had decided the opposite — which is what sharing the file is for.
  const nodes = flattenRecord({ currencies: ["USD", "EUR"] });
  assert.deepEqual(nodes, [{ kind: "field", key: "currencies", value: "USD, EUR" }]);
});
