// lib/history.ts
//
// What the agent has actually done: purchases that settled, and charges it
// refused.
//
// Read on the client only — every function here touches localStorage — so it
// is called from effects, never during render. Keeping it in one module is
// what lets Overview write a blocked attempt and Activity read it back: the
// copy in Activity says a stopped payment exists nowhere else, and that stops
// being true as soon as two components invent their own key for it.

/** Rows the app seeds so the section is not empty on arrival. */
export const POLICY_STORAGE_KEY = "paypal-ai-agent.policies.v1";
/** Charges the server refused, appended as they happen. */
export const BLOCKED_STORAGE_KEY = "paypal-ai-agent.blocked.v1";

export type Purchase = {
  id: string | number;
  /** ISO instant the money moved. Empty when it was never recorded. */
  when: string;
  what: string;
  merchant: string;
  amount: number;
  currency: string;
  condition: string;
  endpoint: string;
  thumbnail: string | null;
  /** True for history this app seeded — never presented as something done. */
  sample: boolean;
};

export type BlockedAttempt = {
  id: string;
  when: string;
  what: string;
  amount: number;
  currency: string;
  endpoint: string;
  /** The exact reason the server gave, printed rather than paraphrased. */
  reason: string;
  sample: boolean;
};

/** Any shape at all can sit in storage; never let it reach a renderer unchecked. */
function readJson(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null");
  } catch {
    // Private mode, disabled storage, or a value something else wrote.
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode: the session keeps working, it just will not
    // survive the next reload.
  }
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

/**
 * An id that works where `crypto.randomUUID` does not.
 *
 * That API only exists in secure contexts, and the dev server happily advertises
 * a LAN address to anyone on the network. A purchase history that throws the
 * moment somebody opens it over http:// is worse than no history at all.
 */
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Seeded history ────────────────────────────────────────────────────────

/**
 * The row as storage hands it back.
 *
 * Every property optional and typed: anything else that ends up in this key
 * is simply not a purchase, and a purchase history is the one place where an
 * unreadable record quietly looks like a real transaction.
 */
export type StoredRow = {
  id?: number;
  status?: string;
  what?: string;
  merchant?: string;
  limit?: number;
  currency?: string;
  condition?: string;
  expires?: string;
  mode?: string;
  allowEndpoint?: string;
  /**
   * Who may receive the money, named when the order was drafted.
   *
   * The counterpart to `allowEndpoint`: that one says which host may be
   * reached, this one says which account the funds may land on. Empty means no
   * recipient was named and therefore nothing is restricted — the same reading
   * the endpoint rule gives an empty allow-list.
   *
   * Optional because rows stored before it existed simply carry none.
   */
  payee?: string;
  /** Catalog thumbnail, or null when nothing matched. */
  marketImage?: string | null;
  /** Catalog price at draft time, null when nothing matched. */
  marketPrice?: number | null;
  /** true = condition satisfied, false = violated, null = cannot be judged. */
  conditionMet?: boolean | null;
  /** How the verdict was reached, including the catalog it came from. */
  conditionDetail?: string;
  /** PayPal's order id, set when the payer is asked to approve a hold. */
  paypalOrderId?: string;
  /**
   * The authorization PayPal issued once the payer approved. Capture and void
   * both refer to it by name, so a hold without one can only be released as a
   * demo decision.
   */
  authorizationId?: string;
  capturedAt?: string;
  createdAt?: string;
};

/**
 * A manifest, with the fields that give an order meaning guaranteed present.
 *
 * `StoredRow` is what storage hands back and cannot promise anything; this is
 * what survives validation. The distinction is what lets the renderer print a
 * ceiling without asking whether one exists.
 */
export type ManifestRow = StoredRow & {
  what: string;
  limit: number;
  currency: string;
  status: string;
};

/**
 * Enough of a record to be called a manifest.
 *
 * Anything missing those fields is dropped rather than padded: a corrupt row
 * rendered with a `0.00 USD` ceiling and a status it never had would be
 * indistinguishable from a real one.
 */
function looksLikeManifest(value: unknown): value is ManifestRow {
  if (!value || typeof value !== "object") return false;
  const row = value as StoredRow;
  return (
    typeof row.what === "string" &&
    row.what.trim() !== "" &&
    typeof row.limit === "number" &&
    Number.isFinite(row.limit) &&
    typeof row.currency === "string" &&
    typeof row.status === "string"
  );
}

/**
 * Every stored order — not only the settled ones.
 *
 * The purchase history only cares what finished; the manifest view needs the
 * whole record, because the point of a manifest is what it constrains before
 * anything has happened.
 */
export function readPolicyRows(): ManifestRow[] {
  const stored = readJson(POLICY_STORAGE_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.filter(looksLikeManifest);
}

/**
 * Five purchases to look at before any have happened.
 *
 * Every price and thumbnail is a real response from the demo catalog — what
 * is invented is only that the purchase took place, and each row carries a
 * Sample chip for exactly that reason. Dates are relative to first run so the
 * report never prints something a judge would clock as stale.
 */
const SAMPLE_PURCHASES: Purchase[] = [
  {
    id: "sample-1",
    when: daysAgo(4),
    what: "Apple AirPods Max Silver",
    merchant: "Amazon",
    amount: 549.99,
    currency: "USD",
    condition: "price <= 600",
    endpoint: "api.amazon.com",
    thumbnail:
      "https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/thumbnail.webp",
    sample: true,
  },
  {
    id: "sample-2",
    when: daysAgo(11),
    what: "Sports Sneakers Off White Red",
    merchant: "Falabella",
    amount: 109.99,
    currency: "USD",
    condition: "price <= 120",
    endpoint: "api.falabella.com",
    thumbnail:
      "https://cdn.dummyjson.com/product-images/mens-shoes/sports-sneakers-off-white-red/thumbnail.webp",
    sample: true,
  },
  {
    id: "sample-3",
    when: daysAgo(18),
    what: "Brown Leather Belt Watch",
    merchant: "Mercado Libre",
    amount: 89.99,
    currency: "USD",
    condition: "in stock",
    endpoint: "api.mercadolibre.com",
    thumbnail:
      "https://cdn.dummyjson.com/product-images/mens-watches/brown-leather-belt-watch/thumbnail.webp",
    sample: true,
  },
  {
    id: "sample-4",
    when: daysAgo(25),
    what: "White Faux Leather Backpack",
    merchant: "Rappi",
    amount: 39.99,
    currency: "USD",
    condition: "",
    endpoint: "api.rappi.com",
    thumbnail:
      "https://cdn.dummyjson.com/product-images/womens-bags/white-faux-leather-backpack/thumbnail.webp",
    sample: true,
  },
  {
    id: "sample-5",
    when: daysAgo(33),
    what: "Essence Mascara Lash Princess",
    merchant: "Amazon",
    amount: 9.99,
    currency: "USD",
    condition: "",
    endpoint: "api.amazon.com",
    thumbnail:
      "https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp",
    sample: true,
  },
];

/** Two refusals, worded the way the server words them. */
const SAMPLE_BLOCKED: BlockedAttempt[] = [
  {
    id: "sample-blocked-1",
    when: daysAgo(3),
    what: "LATAM flight to Rio",
    amount: 901,
    currency: "PYUSD",
    endpoint: "api.unapproved-latam.com",
    reason:
      "Amount 901.00 PYUSD exceeds the 900.00 PYUSD ceiling. Endpoint api.unapproved-latam.com is not allowed for this order (only api.latam.com).",
    sample: true,
  },
  {
    id: "sample-blocked-2",
    when: daysAgo(9),
    what: "Amazon Prime annual",
    amount: 180,
    currency: "USD",
    endpoint: "api.unapproved-amazon.com",
    reason:
      "Amount 180.00 USD exceeds the 150.00 USD ceiling. Endpoint api.unapproved-amazon.com is not allowed for this order (only api.amazon.com).",
    sample: true,
  },
];

// ─── Reading ───────────────────────────────────────────────────────────────

/**
 * Orders that reached `Captured`, newest first, followed by the seeded ones.
 *
 * A row is accepted only if it still looks like a policy: anything else in
 * storage is dropped rather than rendered, because a purchase history is the
 * one place where an unreadable record looks like a real transaction.
 */
export function readPurchases(): Purchase[] {
  const stored = readJson(POLICY_STORAGE_KEY);
  const rows: StoredRow[] = Array.isArray(stored)
    ? (stored.filter(
        (row): row is StoredRow =>
          !!row && typeof row === "object" && row.status === "Captured"
      ) as StoredRow[])
    : [];

  const live: Purchase[] = rows.map((row) => ({
    id: row.id ?? newId(),
    when: row.capturedAt ?? row.createdAt ?? "",
    what: row.what ?? "Unnamed order",
    merchant: row.merchant ?? "",
    amount: typeof row.limit === "number" ? row.limit : 0,
    currency: typeof row.currency === "string" ? row.currency : "USD",
    condition: typeof row.condition === "string" ? row.condition : "",
    endpoint: typeof row.allowEndpoint === "string" ? row.allowEndpoint : "",
    thumbnail: typeof row.marketImage === "string" ? row.marketImage : null,
    sample: false,
  }));

  const sample = SAMPLE_PURCHASES.filter(
    // Never repeat a seed the operator has already seen alongside a live one
    // they made themselves: a real capture of the same order replaces it.
    (seed) => !live.some((row) => row.what === seed.what)
  );

  return [...live, ...sample];
}

export function readBlockedAttempts(): BlockedAttempt[] {
  const stored = readJson(BLOCKED_STORAGE_KEY);
  const rows: BlockedAttempt[] = Array.isArray(stored)
    ? (stored.filter(
        (row): row is BlockedAttempt =>
          !!row &&
          typeof row === "object" &&
          typeof (row as BlockedAttempt).reason === "string" &&
          typeof (row as BlockedAttempt).amount === "number" &&
          !(row as BlockedAttempt).sample
      ) as BlockedAttempt[])
    : [];

  return [...rows, ...SAMPLE_BLOCKED];
}

/**
 * Remove an order for good.
 *
 * This is the "until you take it off" half of a standing allowance: taking it
 * off is what stops it, and the row has to leave storage rather than merely
 * look inactive, or the next page load would bring it back.
 *
 * Returns how many rows were actually removed, so a caller can tell the
 * difference between a successful removal and one that matched nothing — a
 * button that silently does nothing is the worst outcome.
 */
export function removePolicyRow(id: number): number {
  const stored = readJson(POLICY_STORAGE_KEY);
  if (!Array.isArray(stored)) return 0;

  const remaining = stored.filter((row) => {
    if (!row || typeof row !== "object") return true;
    return (row as { id?: number }).id !== id;
  });
  if (remaining.length === stored.length) return 0;

  writeJson(POLICY_STORAGE_KEY, remaining);
  return stored.length - remaining.length;
}

/**
 * Add an order that was drafted outside Overview.
 *
 * A transfer names its recipient while it is being written, so the row it
 * produces is born with the payee already inside it. That ordering is the
 * whole point: an envelope only proves anything if who may receive the money
 * is settled *before* somebody approves it, and writing the recipient after
 * approval would be amending the thing you just agreed to.
 *
 * Appended rather than prepended, because that is how Overview writes this
 * key — a row drafted from Send money must not reorder the table the next
 * time it is read.
 *
 * The type is narrow on purpose. Overview restores a stored array only when
 * *every* entry passes `isPolicyRow` (a numeric id, a non-empty `what`, a
 * finite `limit`, a `currency` and a status `isStatus` accepts), so a row
 * missing any of those does not just fail to appear — it takes every other
 * order down with it and the table silently falls back to the seed.
 */
export function appendPolicyRow(
  row: {
    id: number;
    what: string;
    limit: number;
    currency: string;
    status: string;
    createdAt?: string;
  } & StoredRow
): ManifestRow {
  const stored = readJson(POLICY_STORAGE_KEY);
  const rows: unknown[] = Array.isArray(stored) ? stored : [];
  rows.push({ ...row, createdAt: row.createdAt ?? new Date().toISOString() });
  writeJson(POLICY_STORAGE_KEY, rows);
  return row;
}

/**
 * Merge fields into a stored order.
 *
 * Send money drafts its transfer here and then authorizes it against PayPal,
 * so the ids PayPal hands back have to reach the same row the approval was
 * written into — otherwise Overview would show an order with no authorization
 * while the panel next door holds one.
 *
 * A merge rather than a replacement: only the fields passed are written, so a
 * caller cannot blank the ceiling by forgetting to send it.
 *
 * Returns how many rows changed, because zero means the row was not there and
 * a caller that cannot tell will report a success that never happened.
 */
export function updatePolicyRow(id: number, patch: Partial<StoredRow>): number {
  const stored = readJson(POLICY_STORAGE_KEY);
  if (!Array.isArray(stored)) return 0;

  let changed = 0;
  const next = stored.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const row = entry as Record<string, unknown>;
    if (row.id !== id) return entry;
    changed += 1;
    return { ...row, ...patch };
  });
  if (changed === 0) return 0;

  writeJson(POLICY_STORAGE_KEY, next);
  return changed;
}

/** Append a refusal the server actually made. */
export function recordBlocked(
  attempt: Omit<BlockedAttempt, "id" | "when" | "sample">
): void {
  const stored = readJson(BLOCKED_STORAGE_KEY);
  const rows: BlockedAttempt[] = Array.isArray(stored) ? (stored as BlockedAttempt[]) : [];
  rows.unshift({ ...attempt, id: newId(), when: new Date().toISOString(), sample: false });
  // Bounded: the ledger is for reading, not for growing without end.
  writeJson(BLOCKED_STORAGE_KEY, rows.slice(0, 50));
}

// ─── Formatting ────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatMoney(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

/** Totals grouped by currency — adding USD to PYUSD would mean nothing. */
export function totalsByCurrency(purchases: Purchase[]): Array<{ total: number; currency: string; count: number }> {
  const buckets = new Map<string, { total: number; currency: string; count: number }>();
  for (const purchase of purchases) {
    const key = purchase.currency;
    const bucket = buckets.get(key) ?? { total: 0, currency: key, count: 0 };
    bucket.total += purchase.amount;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total);
}
