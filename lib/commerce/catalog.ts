// lib/commerce/catalog.ts
// Product lookup used to evaluate a price condition.
//
// Source: dummyjson.com — free, keyless, verified reachable with CORS and a
// passing preflight. IMPORTANT: the catalog is FICTIONAL. The HTTP calls are
// real, the products are not. There is no keyless public API for real retail
// prices (Amazon's PA-API requires an associates account), so anything shown
// from here is labelled as a demo catalog in the UI.

const BASE = "https://dummyjson.com";
const REVALIDATE_SECONDS = 60;

/**
 * A product as the approval card shows it.
 *
 * Everything here is a field the catalog actually returns. Shipping *cost*
 * and taxes are deliberately absent: this catalog publishes a lead time
 * ("Ships in 3-5 business days") but no price for either, and inventing one
 * would put a fabricated number next to real ones.
 */
export interface CatalogProduct {
  id: number;
  title: string;
  description: string;
  price: number;
  currency: "USD";
  discountPercentage: number;
  rating: number;
  reviewCount: number;
  stock: number;
  availabilityStatus: string;
  category: string;
  brand?: string;
  sku: string;
  shippingInformation: string;
  returnPolicy: string;
  warrantyInformation: string;
  thumbnail?: string;
  /**
   * Every image the catalog published for this product, largest first.
   *
   * `thumbnail` is a ~200px asset — fine inside a 36px grid cell, far too
   * small to judge a product by, which is the whole point of showing the
   * candidate at all. Empty when the catalog sent none; never filled from
   * `thumbnail`, because a picker that silently promotes a tiny image is a
   * picker that looks fine and shows nothing.
   */
  images: string[];
}

interface RawProduct {
  id?: number;
  title?: string;
  description?: string;
  price?: number;
  discountPercentage?: number;
  rating?: number;
  reviews?: unknown[];
  stock?: number;
  availabilityStatus?: string;
  category?: string;
  brand?: string;
  sku?: string;
  shippingInformation?: string;
  returnPolicy?: string;
  warrantyInformation?: string;
  thumbnail?: string;
  images?: unknown;
}

/** Marks the value as coming from a demo catalog, so the UI never implies otherwise. */
export const CATALOG_SOURCE = {
  name: "dummyjson",
  url: "https://dummyjson.com",
  kind: "demo-catalog" as const,
  note: "Fictional product catalog. Prices are real API responses for demo data.",
};

function normalise(raw: RawProduct | null | undefined): CatalogProduct | null {
  if (!raw || typeof raw.id !== "number" || typeof raw.price !== "number") return null;
  const numberOr = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return {
    id: raw.id,
    title: raw.title ?? "Unnamed product",
    description: raw.description ?? "",
    price: raw.price,
    currency: "USD",
    discountPercentage: numberOr(raw.discountPercentage, 0),
    rating: numberOr(raw.rating, 0),
    reviewCount: Array.isArray(raw.reviews) ? raw.reviews.length : 0,
    stock: numberOr(raw.stock, 0),
    availabilityStatus: raw.availabilityStatus ?? "Unknown",
    category: raw.category ?? "",
    brand: raw.brand,
    sku: raw.sku ?? "",
    shippingInformation: raw.shippingInformation ?? "",
    returnPolicy: raw.returnPolicy ?? "",
    warrantyInformation: raw.warrantyInformation ?? "",
    thumbnail: raw.thumbnail,
    // `images` is typed `unknown` in the raw shape because the catalog is an
    // external feed: anything could arrive under that key, and a string array
    // has to be proved rather than assumed.
    images: Array.isArray(raw.images)
      ? raw.images.filter((value): value is string => typeof value === "string" && value !== "")
      : [],
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Search the catalog. Never throws: a failed lookup returns an empty list and
 * the caller reports "no match" instead of inventing a product.
 */
export async function searchCatalog(query: string): Promise<CatalogProduct[]> {
  const q = query.trim().slice(0, 80);
  if (!q) return [];

  const payload = await getJson<{ products?: RawProduct[] }>(
    `${BASE}/products/search?q=${encodeURIComponent(q)}&limit=5`
  );
  if (!payload?.products) return [];

  return payload.products.map(normalise).filter((p): p is CatalogProduct => p !== null);
}

export async function getProduct(id: number): Promise<CatalogProduct | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  return normalise(await getJson<RawProduct>(`${BASE}/products/${id}`));
}

/**
 * Everything else in the category that fits the ceiling.
 *
 * The direct match is what was asked for; these are what else exists at the
 * price the operator actually set. Offered only when the match is out of
 * budget, so the agent can propose something rather than merely report a
 * refusal — and every price here is the catalog's own, so nothing in the
 * proposal is invented.
 */
export async function findWithinBudget(
  product: CatalogProduct | null,
  ceiling: number
): Promise<CatalogProduct[]> {
  if (!product || !product.category || !Number.isFinite(ceiling)) return [];

  const payload = await getJson<{ products?: RawProduct[] }>(
    `${BASE}/products/category/${encodeURIComponent(product.category)}?limit=20`
  );
  if (!payload?.products) return [];

  return payload.products
    .map(normalise)
    .filter(
      (p): p is CatalogProduct =>
        p !== null &&
        p.id !== product.id &&
        p.price <= ceiling &&
        // A sold-out product is not an option, however cheap.
        p.stock > 0
    )
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);
}

/**
 * Search, then degrade.
 *
 * The demo catalogue ANDs its terms, so the natural phrase "white sneakers"
 * returns nothing while "sneakers" returns two. Falling back to single
 * significant words — longest first, since longer words are more likely to be
 * the product — turns a silent zero-result into an honest best guess, and the
 * caller still reports how the match was reached.
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "only", "when",
  "price", "cost", "size", "color", "colour", "drops", "less", "than",
  "per", "month", "monthly", "want", "need", "buy", "get", "new",
]);

async function searchResilient(query: string): Promise<{ found: CatalogProduct[]; via: string }> {
  const direct = await searchCatalog(query);
  if (direct.length > 0) return { found: direct, via: "full query" };

  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);

  for (const word of words) {
    const result = await searchCatalog(word);
    if (result.length > 0) return { found: result, via: `term "${word}"` };
  }

  return { found: [], via: "no match" };
}

/**
 * Terms considered when scoring a candidate against what was asked for.
 *
 * Short words are dropped because "size 42" and "for the" match everything,
 * and the handful of filter words are ones that appear in a request without
 * describing its subject.
 */
function intentTerms(wanted: string): string[] {
  return wanted
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !["with", "that", "from", "only", "size"].includes(w));
}

type ScoredCandidate = { product: CatalogProduct; hits: number; terms: number };

/**
 * Rank candidates by how much of the request each one actually mentions.
 *
 * Extracted because the picker and the single match must agree on what
 * "better" means: two rankings would let the strip offer a product the
 * approval card then refuses to describe.
 */
function scoreCandidates(wanted: string, found: CatalogProduct[]): ScoredCandidate[] {
  const words = intentTerms(wanted);
  return found
    .map((product) => {
      const haystack = `${product.title} ${product.brand ?? ""} ${product.category}`.toLowerCase();
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { product, hits, terms: words.length };
    })
    .sort((a, b) => b.hits - a.hits);
}

/**
 * Pick the catalog entry the policy refers to. Reports how the match was
 * reached so the UI never implies a precision that did not happen.
 */
export async function matchProduct(
  wanted: string
): Promise<{ product: CatalogProduct | null; matchedBy: string | null }> {
  const { found, via } = await searchResilient(wanted);
  if (found.length === 0) return { product: null, matchedBy: null };

  const best = scoreCandidates(wanted, found)[0];

  // No overlap with the requested item means this is not a match, it is just
  // the first row of whatever the fallback query returned. Showing a sofa for
  // "spotify premium" is worse than showing nothing.
  if (!best || best.hits === 0) return { product: null, matchedBy: null };

  return {
    product: best.product,
    matchedBy: `${best.hits}/${best.terms} terms matched (${via})`,
  };
}

/**
 * Every candidate worth showing, best first — the list `matchProduct` picks
 * its single winner from, rather than the winner alone.
 *
 * The picker exists because that winner was chosen silently: the operator saw
 * the product the agent preferred and never the two it passed over, so the
 * choice was invisible precisely where a human is meant to make it.
 *
 * Returns fewer than `limit` when the catalog returned fewer, and none when
 * nothing overlapped with the request. Both are reported as they are — a
 * "2 candidates found" strip is honest, a third card padded with a sofa is
 * not, and the `hits > 0` rule is the same one the single match applies.
 *
 * `candidates[0]` is what `matchProduct` would return, so a caller can take
 * the list once instead of searching twice.
 */
export async function searchCandidates(
  wanted: string,
  limit = 3
): Promise<{ candidates: CatalogProduct[]; matchedBy: string | null }> {
  const { found, via } = await searchResilient(wanted);
  if (found.length === 0) return { candidates: [], matchedBy: null };

  const eligible = scoreCandidates(wanted, found).filter((entry) => entry.hits > 0);
  if (eligible.length === 0) return { candidates: [], matchedBy: null };

  const best = eligible[0];
  return {
    candidates: eligible.slice(0, Math.max(1, limit)).map((entry) => entry.product),
    matchedBy: `${best.hits}/${best.terms} terms matched (${via})`,
  };
}

/**
 * Evaluate a condition against a product. Returns null `met` when it cannot
 * be judged — an unanswerable condition must never read as "passed".
 *
 * Deliberately price- and stock-based only: exchange rate is a country-specific
 * concern, not part of the general purchase-order path.
 */
export type ConditionEvaluation = {
  raw: string;
  met: boolean | null;
  /** Plain-language explanation of what was compared. */
  detail: string;
};

export function evaluateCondition(
  raw: string,
  product: CatalogProduct | null
): ConditionEvaluation {
  const expression = raw.trim();
  if (!expression) return { raw, met: true, detail: "No condition — executes immediately." };

  if (!product) {
    return {
      raw,
      met: null,
      detail: "No catalog match, so this condition cannot be checked.",
    };
  }

  const lower = expression.toLowerCase();

  // "in stock" / "available"
  if (/\bin stock\b|\bavailable\b/.test(lower)) {
    const ok = product.stock > 0 && product.availabilityStatus === "In Stock";
    return {
      raw,
      met: ok,
      detail: `${product.stock} in stock (${product.availabilityStatus})`,
    };
  }

  // "price <= 60", "price > 100", "price = 109.99"
  const priceMatch = lower.match(/price\s*(<=|>=|<|>|=|==)\s*([\d.,]+)/);
  if (priceMatch) {
    const operator = priceMatch[1].replace("==", "=");
    const threshold = Number(priceMatch[2].replace(/,/g, ""));
    if (!Number.isFinite(threshold)) {
      return { raw, met: null, detail: "Threshold in this condition is not a number." };
    }

    const price = product.price;
    const met =
      operator === "<=" ? price <= threshold
      : operator === ">=" ? price >= threshold
      : operator === "<"  ? price < threshold
      : operator === ">"  ? price > threshold
      :                     price === threshold;

    return {
      raw,
      met,
      detail: `Price is ${price.toFixed(2)} USD, condition requires ${operator} ${threshold}`,
    };
  }

  return {
    raw,
    met: null,
    detail: `Condition "${expression}" is not one this build can evaluate.`,
  };
}
