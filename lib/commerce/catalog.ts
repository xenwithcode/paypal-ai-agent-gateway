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

export interface CatalogProduct {
  id: number;
  title: string;
  price: number;
  currency: "USD";
  stock: number;
  availabilityStatus: string;
  category: string;
  brand?: string;
  thumbnail?: string;
}

interface RawProduct {
  id?: number;
  title?: string;
  price?: number;
  stock?: number;
  availabilityStatus?: string;
  category?: string;
  brand?: string;
  thumbnail?: string;
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
  return {
    id: raw.id,
    title: raw.title ?? "Unnamed product",
    price: raw.price,
    currency: "USD",
    stock: typeof raw.stock === "number" ? raw.stock : 0,
    availabilityStatus: raw.availabilityStatus ?? "Unknown",
    category: raw.category ?? "",
    brand: raw.brand,
    thumbnail: raw.thumbnail,
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
 * Pick the catalog entry the policy refers to. Reports how the match was
 * reached so the UI never implies a precision that did not happen.
 */
export async function matchProduct(
  wanted: string
): Promise<{ product: CatalogProduct | null; matchedBy: string | null }> {
  const { found, via } = await searchResilient(wanted);
  if (found.length === 0) return { product: null, matchedBy: null };

  const words = wanted
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !["with", "that", "from", "only", "size"].includes(w));

  const scored = found
    .map((product) => {
      const haystack = `${product.title} ${product.brand ?? ""} ${product.category}`.toLowerCase();
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { product, hits };
    })
    .sort((a, b) => b.hits - a.hits);

  const best = scored[0];

  // No overlap with the requested item means this is not a match, it is just
  // the first row of whatever the fallback query returned. Showing a sofa for
  // "spotify premium" is worse than showing nothing.
  if (!best || best.hits === 0) return { product: null, matchedBy: null };

  return {
    product: best.product,
    matchedBy: `${best.hits}/${words.length} terms matched (${via})`,
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
