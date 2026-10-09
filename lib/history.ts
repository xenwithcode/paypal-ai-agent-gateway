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

// The keys and the sync live here; history keeps importing them so its readers
// and writers do not have to follow. The extension is required rather than
// optional: `tests/history.test.ts` loads this module through Node's ESM
// resolver, which wants one — see the note on `allowImportingTsExtensions`.
// A module reachable from a test imports with the extension; a module only
// ever bundled by Next may keep dropping it.
import { POLICY_STORAGE_KEY, BLOCKED_STORAGE_KEY, pushToStore } from "./store.ts";
// Statuses as constants, not as strings typed twice: the portfolio card
// compares these with `===`, and a sample that spelled "Captured" its own way
// would be a record only the sample understands.
import { STATUS } from "./policy.ts";
// One classifier, used by the chart and by this list — a table that calls a
// stake a purchase and a bar that does not is two answers to one question.
import { activityKindOf, type ActivityKind } from "./activityByType.ts";
// Type-only import of ManifestRow lives in manifests.ts, so this direction is
// the only runtime one: history → manifests, and no cycle to resolve.
import { looksLikeManifest } from "./manifests.ts";
// Type-only, so nothing of the catalog's fetch code is pulled into a module
// every reader loads — and with the extension, because this module is reached
// from a test.
import type { CandidateRecord } from "./commerce/catalog.ts";

// Re-exported so every existing reader keeps importing from here. The keys
// moved to the module that syncs them; making callers follow would be churn
// for its own sake, and a second definition of the name is how two components
// end up writing to different places. The records themselves are the rows the
// app seeds so a section is not empty on arrival, and the charges the server
// refused as they happened.
export { POLICY_STORAGE_KEY, BLOCKED_STORAGE_KEY };

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
  /**
   * What kind of spending this was, derived rather than stored.
   *
   * A settled order that funded a campaign is not a purchase, and a list of
   * them headed "Purchases completed" would be a heading that lies about its
   * own contents. Same rule the bars above use — `activityKindOf` — so the
   * chart and the table can never disagree about a row.
   */
  kind: ActivityKind;
  /** The campaign it funded, when it funded one. */
  project?: string;
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
  /**
   * Who refused it — the gateway's own rules, or PayPal.
   *
   * The two are the same event to a reader ("it did not go through") and two
   * completely different facts to an operator: one means *your envelope held*,
   * the other means *the money reached the counter and was turned away there*.
   * Absent on records written before the distinction existed, which read as
   * the gateway's — the only kind there was.
   */
  source?: "policy" | "paypal";
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
    // survive the next reload. Return rather than fall through, because
    // pushing a copy the working store rejected would send a state this
    // browser no longer holds.
    return;
  }
  // The working copy moved, so the durable copy follows — debounced, since
  // this runs on every edit a person makes to a ceiling or a condition.
  pushToStore();
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
  /**
   * What the search returned for this order, kept so the choice survives it.
   *
   * The three fields below are written together because they answer one
   * question — *the agent proposed X, the human took Y, from a list of Z* —
   * and a row holding two of the three is a record that argues with itself.
   * Optional because rows stored before they existed carry none, and an
   * absent `candidates` reads as *no strip was recorded*, not as *none was
   * found*.
   */
  /**
   * The project this order funds, when it funds one.
   *
   * An investment *is* a purchase order — the product is a stake, the ceiling
   * is the amount, the window is the campaign's closing date — so it needs no
   * ledger of its own: it carries this id and everything else (persistence,
   * capture, the console) already works. A row without it is an ordinary
   * order, which is why the field is optional.
   */
  project?: string;
  candidates?: CandidateRecord[];
  /** Which candidate the agent would have taken. */
  matchedId?: number | null;
  /** Which candidate the human took; equal to `matchedId` when they agreed. */
  chosenId?: number | null;
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
  /**
   * Present only on rows this product *shows* rather than rows it recorded.
   *
   * A sample is a presentation of what a filled screen looks like — the same
   * distinction Activity makes with its five seeded purchases — and it must
   * never reach storage, or a dollar nobody reserved starts moving totals
   * somewhere else. Readers may trust the flag: nothing in this app writes it.
   */
  sample?: boolean;
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
 * Every stored order — not only the settled ones.
 *
 * The purchase history only cares what finished; the manifest view needs the
 * whole record, because the point of a manifest is what it constrains before
 * anything has happened. The test of what counts lives in `lib/manifests.ts`,
 * beside the builder — this page and the endpoint a counterparty fetches must
 * agree on which rows are records at all.
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
const SAMPLE_PURCHASES: Omit<Purchase, "kind">[] = [
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
    kind: activityKindOf(row),
    project: typeof row.project === "string" && row.project ? row.project : undefined,
  }));

  const sample = SAMPLE_PURCHASES.filter(
    // Never repeat a seed the operator has already seen alongside a live one
    // they made themselves: a real capture of the same order replaces it.
    (seed) => !live.some((row) => row.what === seed.what)
  ).map((seed) => ({ ...seed, kind: "purchase" as const }));

  return [...live, ...sample];
}

/**
 * Three positions nobody made — shown only while the showcase is empty.
 *
 * The donut, the six figures and the odometer are the argument the
 * crowdfunding screen makes, and with an empty portfolio every one of them
 * reads `$0`: a judge would see the machinery and none of what it computes.
 * Activity solves the same problem the same way — five seeded purchases, each
 * carrying `sample`.
 *
 * Three rules, so a sample can never pass for money:
 *
 *  · **It is marked.** `sample: true` rides on every row and the card prints a
 *    chip beside it — the same chip Activity prints on its purchases.
 *  · **It is a presentation, not a record.** Built on read, dated relative to
 *    `now` (a stored sample dates itself the day the repo was published), and
 *    never written to the policy store — so Overview, Money in flight and the
 *    ledger never count a dollar that was never reserved.
 *  · **It is replaced, not merged.** The moment one real position exists,
 *    these disappear: the operator's totals are never half theirs, half ours.
 *
 * Paid, reserved and returned, one each — because those are the three slices
 * the donut draws, and the third is the state this card has already been wrong
 * about once.
 */
export function sampleInvestments(now: Date = new Date()): ManifestRow[] {
  const since = (days: number): string => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };

  return [
    {
      id: -1,
      what: "Stake in Supermercado Express",
      merchant: "Chacao, Miranda",
      limit: 100,
      currency: "USD",
      condition: "",
      allowEndpoint: "",
      payee: "",
      status: STATUS.captured,
      project: "supermercado-express-chacao",
      createdAt: since(6),
      capturedAt: since(5),
      sample: true,
    },
    {
      id: -2,
      what: "Stake in Finca de Café El Samán",
      merchant: "Yaracuy",
      limit: 50,
      currency: "USD",
      condition: "",
      allowEndpoint: "",
      payee: "",
      status: STATUS.reserved,
      project: "finca-cafe-el-saman",
      createdAt: since(4),
      sample: true,
    },
    {
      id: -3,
      what: "Stake in Agropecuaria El Cacao",
      merchant: "Lara",
      limit: 25,
      currency: "USD",
      condition: "",
      allowEndpoint: "",
      payee: "",
      status: STATUS.released,
      project: "agropecuaria-el-cacao",
      createdAt: since(3),
      sample: true,
    },
  ];
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

/**
 * Write the order table.
 *
 * The one path the grid writes through, so its edits reach the durable copy
 * the same way every other write does. It used to call `localStorage` itself,
 * which meant a ceiling edited or a hold captured here stayed in this browser
 * — and the server, asked by a second one, would answer with rows that had
 * never heard of it.
 */
export function writePolicyRows(rows: readonly unknown[]): void {
  writeJson(POLICY_STORAGE_KEY, rows);
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
