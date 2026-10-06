// lib/gridColumns.ts
//
// How to read nested JSON records: into columns for many of them, and into
// labelled lines for one. Both derive the answer from the data rather than
// declaring it, and both apply the same rules about what counts as content —
// which is why they share a file.
//
// Columns, first: PayPal's records are nested three or four deep and they do
// deep and they do not all look alike. A payout carries `shippingInfo`; a
// subscription payment does not. Writing those columns by hand means a grid
// full of blank columns for sections that were never there, quietly missing
// the ones that were. Walking the records instead means the headers mirror how
// the response actually nests — `transactionInfo ▸ transactionAmount ▸ value`
// — which is the one thing a reader needs in order to trust what a cell means.
//
// The types are imported as types only, so a test can load this module
// without loading AG Grid with it.

import type { ColDef, ColGroupDef } from "ag-grid-community";

/** One node of the path tree: a key seen in some record, and what nested under it. */
type PathNode = { children: Map<string, PathNode> };

/**
 * Keys skipped while walking a record.
 *
 * `links` is HATEOAS navigation — it repeats on every row, points at PayPal's
 * own URLs, and says nothing about the transaction. A column of identical
 * hyperlinks is noise with a header on it.
 */
const NOISE_KEYS = new Set(["links"]);

/**
 * Whether a value opens into more columns.
 *
 * An object with no keys has nothing to show and PayPal returns a lot of them
 * (`cartInfo: {}`, `storeInfo: {}`) — naming a section is not reporting on it.
 * An array only opens if it holds objects; an array of scalars is one cell,
 * because `["USD", "EUR"]` as three columns tells nobody anything.
 */
function isNested(value: unknown): value is Record<string, unknown> | unknown[] {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => item !== null && typeof item === "object");
  return Object.keys(value).length > 0;
}

function collectPaths(value: Record<string, unknown> | unknown[], node: PathNode): void {
  for (const [key, child] of Object.entries(value)) {
    if (NOISE_KEYS.has(key)) continue;

    const nested = isNested(child);
    // An object that does not open is skipped rather than kept as a leaf: a
    // column whose every cell would be "{}" is the same noise as a link.
    if (!nested && child !== null && typeof child === "object" && !Array.isArray(child)) continue;

    let next = node.children.get(key);
    if (!next) {
      next = { children: new Map() };
      node.children.set(key, next);
    }
    if (nested) collectPaths(child as Record<string, unknown> | unknown[], next);
  }
}

function toColumns(
  node: PathNode,
  prefix: string,
  lead: readonly string[]
): (ColDef | ColGroupDef)[] {
  const entries = Array.from(node.children);
  // Sorted only when somebody asked for an order. The default keeps whatever
  // order the data arrived in — which is the right default for a generic
  // reader and the wrong one for a person, hence the option below.
  const ordered = lead.length
    ? [...entries].sort((a, b) => rankOf(prefix, a[0], lead) - rankOf(prefix, b[0], lead))
    : entries;

  return ordered.map(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    // Array positions are numbers, and a header of bare `0` reads as a column
    // named zero rather than as "the first of these".
    const headerName = /^\d+$/.test(key) ? `[${key}]` : key;

    if (child.children.size === 0) {
      return {
        headerName,
        colId: path,
        // A dotted field is how AG Grid reads a nested value, so the cell
        // needs no accessor of its own.
        field: path,
        headerTooltip: path,
      };
    }

    return {
      headerName,
      groupId: path,
      // Keep the group's columns together when one is sorted or resized, so
      // `transactionAmount` never ends up parked beside `feeAmount`'s parent.
      marryChildren: true,
      children: toColumns(child, path, lead),
    };
  });
}

/**
 * Where this column sits in the order somebody asked for.
 *
 * A lead entry matches either the column itself or anything nested under it,
 * which is what lets one list order both the groups and the leaves inside
 * them: `transactionInfo.transactionAmount` puts the group `transactionInfo`
 * first *and* the amount first within it.
 *
 * Columns nothing claims come last and keep the order they arrived in — the
 * sort is stable, so asking for three columns does not shuffle the other
 * forty-three into a new arbitrary order.
 */
function rankOf(prefix: string, key: string, lead: readonly string[]): number {
  const path = prefix ? `${prefix}.${key}` : key;
  for (let index = 0; index < lead.length; index += 1) {
    const entry = lead[index];
    if (entry === path || entry.startsWith(`${path}.`)) return index;
  }
  return Number.MAX_SAFE_INTEGER;
}

export type ColumnOptions = {
  /**
   * Paths or prefixes to bring to the front, most important first.
   *
   * Leftmost is what a reader sees before scrolling, so the default — the
   * order the data arrived in — can put an identifier where a person would
   * expect an amount. Somebody has to decide what "most important" means, and
   * it is not this module's business to guess: the caller passes it, because
   * the caller is the one who knows what the table is for.
   */
  lead?: readonly string[];
};

/**
 * The columns these records need, discovered from the records themselves.
 *
 * Call it once per dataset: the same field can exist in one row and not in
 * another, so the tree is built across every row rather than from the first —
 * a grid that only read `rows[0]` would drop a column the moment a second
 * record carried a field the first did not.
 */
export function columnDefsFor(
  rows: readonly object[],
  options: ColumnOptions = {}
): (ColDef | ColGroupDef)[] {
  const root: PathNode = { children: new Map() };
  for (const row of rows) {
    collectPaths(row as Record<string, unknown>, root);
  }
  return toColumns(root, "", options.lead ?? []);
}

/**
 * A cell's value as text, whatever it turned out to be.
 *
 * `null` is empty rather than the string `"null"` — a missing field should
 * look missing. Objects are shown as JSON rather than as `[object Object]`,
 * because the alternative tells a reader that a field exists while hiding what
 * is in it.
 */
export function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** One line of a record read vertically: either a heading, or a label and a value. */
export type DetailNode =
  | { kind: "group"; key: string; children: DetailNode[] }
  | { kind: "field"; key: string; value: string };

/** Nothing to say: absent, null, or an empty string are all "not here". */
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * One record, laid out for reading top to bottom.
 *
 * The sibling of `columnDefsFor` over the same problem and the same rules —
 * which is why they share this module: both skip `links`, both skip a section
 * that is empty rather than showing it as blank, and both would drift if the
 * two were written apart.
 *
 * What differs is the question. Columns ask "what fields exist across these
 * records"; this asks "what does *this* record have". A section PayPal filled
 * in another row and not this one must disappear here, because a heading with
 * nothing under it reads as "this field is blank" — and blank is not the same
 * fact as "was never here".
 */
export function flattenRecord(value: unknown): DetailNode[] {
  const nodes: DetailNode[] = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const key = `[${index}]`;
      if (item !== null && typeof item === "object") {
        const children = flattenRecord(item);
        if (children.length > 0) nodes.push({ kind: "group", key, children });
      } else if (!isBlank(item)) {
        nodes.push({ kind: "field", key, value: String(item) });
      }
    }
    return nodes;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (NOISE_KEYS.has(key) || isBlank(child)) continue;

      if (typeof child === "object") {
        // An array of scalars is one value here for the same reason it is one
        // cell in the grid: two strings as two lines tells nobody anything,
        // and two copies of that rule is two copies to keep agreeing.
        if (Array.isArray(child) && !child.some((item) => item !== null && typeof item === "object")) {
          const rendered = child.filter((item) => !isBlank(item)).map(String);
          if (rendered.length > 0) nodes.push({ kind: "field", key, value: rendered.join(", ") });
          continue;
        }

        const children = flattenRecord(child);
        // An object with nothing readable under it is a heading with no
        // entries: the section exists in the schema and was not filled here.
        if (children.length > 0) nodes.push({ kind: "group", key, children });
        continue;
      }

      nodes.push({ kind: "field", key, value: String(child) });
    }
    return nodes;
  }

  return nodes;
}

/**
 * How these cells are read, shared by every grid built from JSON.
 *
 * `cellDataType: false` is the important one: AG Grid otherwise infers a type
 * from the first row, and a field that is a string in one record and absent in
 * another becomes a checkbox or a select — an edit control over data nobody
 * chose to make editable. The formatter above is what makes guessing
 * unnecessary in the first place.
 */
export const JSON_COL_DEF: ColDef = {
  filter: true,
  sortable: true,
  minWidth: 90,
  maxWidth: 420,
  cellDataType: false,
  valueFormatter: ({ value }) => formatCell(value),
};
