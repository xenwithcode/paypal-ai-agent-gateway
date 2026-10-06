// lib/manifests.ts
//
// What an order looks like to a machine.
//
// The card in Agentic Commerce shows a person the ceiling, the condition and
// the destination; this is the same record in the shape a counterparty would
// fetch. Split out because there are now two readers of it — the page a person
// opens, and `GET /api/manifest`, which a buyer or seller agent reads — and
// two copies of "what a manifest contains" is two copies to keep agreeing.
//
// A manifest is what an order *constrains before anything happens*, which is
// why it is built from every stored row and not only the settled ones.

import type { ManifestRow } from "./history";

/**
 * A row that can become a manifest.
 *
 * Anything missing those fields is dropped rather than padded: a corrupt row
 * rendered with a `0.00 USD` ceiling and a status it never had would be
 * indistinguishable from a real one — and this record is the one a machine
 * reads without a human to notice the difference.
 */
export function looksLikeManifest(value: unknown): value is ManifestRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.what === "string" &&
    row.what.trim() !== "" &&
    typeof row.limit === "number" &&
    Number.isFinite(row.limit) &&
    typeof row.currency === "string" &&
    typeof row.status === "string"
  );
}

/** The manifest as a counterparty receives it. `null` means *not restricted*. */
export type Manifest = {
  what: string;
  merchant: string | null;
  ceiling: { amount: number; currency: string };
  condition: string | null;
  valid_until: string | null;
  mode: string | null;
  payee: string | null;
  allow_endpoint: string | null;
  status: string;
};

/**
 * One order, in the shape a machine reads.
 *
 * Absent fields are `null` rather than omitted or defaulted, and the
 * distinction matters in both directions: a reader that gets `payee: null`
 * knows no recipient was named, while one that simply lacks the key cannot
 * tell "not restricted" from "this schema does not have that field". The
 * second reading is how a restriction silently disappears.
 */
export function manifestFor(row: ManifestRow): Manifest {
  const condition = row.condition?.trim() ?? "";
  const expires = row.expires?.trim() ?? "";
  const endpoint = row.allowEndpoint?.trim() ?? "";
  // Absent on rows written before this field existed; it reads as no
  // restriction, the same way an empty endpoint does.
  const payee = row.payee?.trim() ?? "";

  return {
    what: row.what,
    merchant: row.merchant || null,
    ceiling: { amount: row.limit, currency: row.currency },
    condition: condition || null,
    valid_until: expires || null,
    mode: row.mode ?? null,
    // The recipient sits with the endpoint because they are the same question
    // asked twice: where may this order send money.
    payee: payee || null,
    allow_endpoint: endpoint || null,
    status: row.status,
  };
}
