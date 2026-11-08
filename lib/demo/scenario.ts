// lib/demo/scenario.ts
//
// The one search the guided film performs, recorded as data.
//
// The demo is a performance with a fixed script: it must not wait 40 seconds
// on a model that is having a bad afternoon, and it must not show a different
// pair of sneakers to every judge. So the film's draft request asks
// `/api/agent` for this scenario explicitly. The route still builds the same
// envelope, evaluates the same condition and returns the same candidate
// shape — what is fixed is the *input*, not the machinery. The manual path
// (typing or speaking) continues to call Gemini live.
//
// The products are the demo catalog's own records (dummyjson ids 91 and 92),
// with their images copied into `public/demo/products` so the film works even
// if the catalog host is unreachable. The prices and titles are the catalog's,
// not invented ones.

import { MODE } from "../policy.ts";
import type { CatalogProduct } from "../commerce/catalog.ts";

/** The exact sentence the film types. */
export const DEMO_SCENARIO_PROMPT =
  "white sneakers under 120 dollars, by Friday, only if the price drops to 110 dollars or less";

/** The next Friday, so the demo's window is always in the future. */
export function nextFridayISO(now: Date = new Date()): string {
  const date = new Date(now);
  const day = date.getDay();
  const delta = (5 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

const REASON = "Sports sneakers with white as the primary design element.";

function product(entry: {
  id: number;
  title: string;
  price: number;
  rating: number;
  stock: number;
  sku: string;
  image: string;
  thumbnail: string;
}): CatalogProduct {
  return {
    id: entry.id,
    title: entry.title,
    description: REASON,
    price: entry.price,
    currency: "USD",
    discountPercentage: 5,
    rating: entry.rating,
    reviewCount: 3,
    stock: entry.stock,
    availabilityStatus: "In Stock",
    category: "mens-shoes",
    brand: "Off White",
    sku: entry.sku,
    shippingInformation: "Ships in 3-5 business days",
    returnPolicy: "30 days return policy",
    warrantyInformation: "1 week warranty",
    thumbnail: entry.thumbnail,
    images: [entry.image],
    reason: REASON,
  };
}

/** The agent's favourite is 91; the human chooses 92, which meets the condition. */
export const DEMO_SCENARIO_CANDIDATES: CatalogProduct[] = [
  product({
    id: 91,
    title: "Sports Sneakers Off White & Red",
    price: 119.99,
    rating: 4.77,
    stock: 17,
    sku: "MEN-OFF-SPO-091",
    image: "/demo/products/sneakers-91.webp",
    thumbnail: "/demo/products/sneakers-91-thumb.webp",
  }),
  product({
    id: 92,
    title: "Sports Sneakers Off White Red",
    price: 109.99,
    rating: 4.69,
    stock: 62,
    sku: "MEN-OFF-SPO-092",
    image: "/demo/products/sneakers-92.webp",
    thumbnail: "/demo/products/sneakers-92-thumb.webp",
  }),
];

/** The envelope the film shows: a real ceiling, condition, window and mode. */
export function demoScenarioPolicy(now: Date = new Date()) {
  return {
    what: "white sneakers",
    merchant: "Off White",
    limit: 120,
    currency: "USD",
    condition: "price <= 110",
    expires: nextFridayISO(now),
    mode: MODE.copilot,
    searchQuery: "sneakers",
  };
}

/** Which candidate the agent would have picked, so the strip can mark it. */
export const DEMO_SCENARIO_MATCHED_ID = 91;

/** The reason the console prints for this path. */
export const DEMO_SCENARIO_REASON =
  "Guided demo: the recorded scenario is used so the film never waits on a model. The typed and spoken paths still call Gemini.";
