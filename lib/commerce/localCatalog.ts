// lib/commerce/localCatalog.ts
//
// The local half of the demo catalog.
//
// `dummyjson` is a fictional catalogue of about two hundred records, and its
// search is literal: it has sneakers and laptops, but no motorcycle jacket and
// no Chelsea boots. A judge who types one of those should still see the product
// they asked for — not a motorcycle offered as a jacket, and not an empty strip.
//
// So this file is a small, curated set of common products with their own local
// illustrations. It is consulted *alongside* dummyjson: the remote catalogue
// keeps its breadth, and this one fills the gaps without a key, a quota, a
// network call or a runtime image fetch. Every row is still a demo record, and
// the source label on the card says so.
//
// The `keywords` field is what makes a Spanish request work: the model already
// translates "chaqueta para montar moto" to "motorcycle riding jacket", but the
// keyword list also carries "chaqueta" and "moto" so a failed translation
// cannot turn a real match into an empty strip.

import type { CatalogProduct } from "./catalog.ts";

/** Local ids start above dummyjson's range, so a product can be resolved exactly. */
export const LOCAL_CATALOG_ID_BASE = 9_000;

export type LocalProduct = CatalogProduct & {
  /** Search terms the card/title may not repeat, in English and Spanish. */
  keywords: string[];
};

const IMAGE_ROOT = "/catalog";

function product(entry: {
  id: number;
  title: string;
  description: string;
  price: number;
  brand: string;
  category: string;
  sku: string;
  rating: number;
  stock: number;
  image: string;
  keywords: string[];
}): LocalProduct {
  const image = `${IMAGE_ROOT}/${entry.image}.svg`;
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    price: entry.price,
    currency: "USD",
    discountPercentage: 0,
    rating: entry.rating,
    reviewCount: 18,
    stock: entry.stock,
    availabilityStatus: "In Stock",
    category: entry.category,
    brand: entry.brand,
    sku: entry.sku,
    shippingInformation: "Ships in 2-4 business days",
    returnPolicy: "30 days return policy",
    warrantyInformation: "6 months warranty",
    thumbnail: image,
    images: [image],
    reason: "Local demo catalog match.",
    keywords: entry.keywords,
  };
}

/** The curated catalogue. Prices are fictional, like the rest of the demo data. */
export const LOCAL_PRODUCTS: LocalProduct[] = [
  product({
    id: LOCAL_CATALOG_ID_BASE + 1,
    title: "Motorcycle Riding Jacket",
    description: "A reinforced riding jacket with a removable thermal liner.",
    price: 129.99,
    brand: "Roadline",
    category: "jackets",
    sku: "LOC-MJ-001",
    rating: 4.7,
    stock: 24,
    image: "motorcycle-jacket",
    keywords: [
      "motorcycle", "moto", "motorbike", "riding", "jacket", "chaqueta",
      "biker", "leather", "protection", "armored",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 2,
    title: "Winter Down Jacket",
    description: "A lightweight down jacket for cold mornings and travel.",
    price: 159.99,
    brand: "Northline",
    category: "jackets",
    sku: "LOC-WJ-002",
    rating: 4.6,
    stock: 18,
    image: "winter-jacket",
    keywords: [
      "winter", "down", "jacket", "chaqueta", "coat", "abrigo", "cold",
      "puffer", "outerwear",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 3,
    title: "Chelsea Leather Boots",
    description: "Ankle-height leather boots with elastic side panels.",
    price: 89.99,
    brand: "Barton",
    category: "boots",
    sku: "LOC-CB-003",
    rating: 4.8,
    stock: 31,
    image: "chelsea-boots",
    keywords: [
      "chelsea", "boots", "botas", "botines", "leather", "ankle", "formal",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 4,
    title: "Over-Ear Headphones",
    description: "Closed-back headphones with a detachable cable.",
    price: 79.99,
    brand: "Auralis",
    category: "audio",
    sku: "LOC-HP-004",
    rating: 4.7,
    stock: 42,
    image: "headphones",
    keywords: [
      "headphones", "headphone", "audio", "music", "over-ear", "studio",
      "auriculares", "listening",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 5,
    title: "Espresso Coffee Machine",
    description: "A compact espresso machine with a steam wand.",
    price: 149.99,
    brand: "Brewline",
    category: "kitchen",
    sku: "LOC-CM-005",
    rating: 4.6,
    stock: 12,
    image: "coffee-machine",
    keywords: [
      "coffee", "espresso", "machine", "kitchen", "cafe", "cafetera",
      "barista", "brew",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 6,
    title: "Commuter Backpack",
    description: "A water-resistant backpack with a padded laptop sleeve.",
    price: 59.99,
    brand: "Trailhead",
    category: "bags",
    sku: "LOC-BP-006",
    rating: 4.5,
    stock: 37,
    image: "backpack",
    keywords: [
      "backpack", "bag", "mochila", "commuter", "travel", "laptop",
      "rucksack", "carry",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 7,
    title: "Fitness Smartwatch",
    description: "A lightweight smartwatch with heart-rate and sleep tracking.",
    price: 119.99,
    brand: "Pulse",
    category: "wearables",
    sku: "LOC-SW-007",
    rating: 4.6,
    stock: 29,
    image: "fitness-smartwatch",
    keywords: [
      "smartwatch", "watch", "reloj", "fitness", "wearable", "sport",
      "tracker", "health",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 8,
    title: "Polarized Sunglasses",
    description: "Polarized lenses in a lightweight acetate frame.",
    price: 49.99,
    brand: "Sunline",
    category: "accessories",
    sku: "LOC-SG-008",
    rating: 4.4,
    stock: 55,
    image: "polarized-sunglasses",
    keywords: [
      "sunglasses", "glasses", "gafas", "lentes", "polarized", "shades",
      "sun", "eyewear",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 9,
    title: "Ergonomic Office Chair",
    description: "A mesh office chair with adjustable lumbar support.",
    price: 199.99,
    brand: "SitWell",
    category: "furniture",
    sku: "LOC-OC-009",
    rating: 4.7,
    stock: 14,
    image: "office-chair",
    keywords: [
      "office", "chair", "silla", "ergonomic", "desk", "furniture",
      "mesh", "lumbar",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 10,
    title: "LED Desk Lamp",
    description: "A dimmable desk lamp with a warm-to-cool light control.",
    price: 39.99,
    brand: "Lumen",
    category: "home",
    sku: "LOC-DL-010",
    rating: 4.5,
    stock: 48,
    image: "desk-lamp",
    keywords: [
      "lamp", "desk", "light", "lampara", "led", "home", "reading",
      "dimmable",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 11,
    title: "Mirrorless Camera",
    description: "A compact mirrorless camera with a 24 MP sensor.",
    price: 499.99,
    brand: "Optiq",
    category: "electronics",
    sku: "LOC-MC-011",
    rating: 4.8,
    stock: 9,
    image: "mirrorless-camera",
    keywords: [
      "camera", "camara", "mirrorless", "photography", "photo", "lens",
      "sensor",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 12,
    title: "Mechanical Keyboard",
    description: "A hot-swappable mechanical keyboard with tactile switches.",
    price: 89.99,
    brand: "KeyForge",
    category: "electronics",
    sku: "LOC-KB-012",
    rating: 4.7,
    stock: 26,
    image: "mechanical-keyboard",
    keywords: [
      "keyboard", "mechanical", "teclado", "typing", "gaming", "switches",
      "keys",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 13,
    title: "Portable Bluetooth Speaker",
    description: "A splash-resistant speaker with a twelve-hour battery.",
    price: 69.99,
    brand: "Boomlet",
    category: "audio",
    sku: "LOC-SP-013",
    rating: 4.5,
    stock: 33,
    image: "bluetooth-speaker",
    keywords: [
      "speaker", "bluetooth", "audio", "parlante", "portable", "music",
      "battery",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 14,
    title: "Amber Perfume",
    description: "A warm amber fragrance with cedar and vanilla.",
    price: 79.99,
    brand: "Maison",
    category: "fragrances",
    sku: "LOC-PF-014",
    rating: 4.6,
    stock: 21,
    image: "perfume",
    keywords: [
      "perfume", "fragrance", "scent", "colonia", "aroma", "amber",
      "eau de parfum",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 15,
    title: "Leather Phone Case",
    description: "A slim leather case with a raised camera surround.",
    price: 29.99,
    brand: "Casetta",
    category: "mobile-accessories",
    sku: "LOC-PC-015",
    rating: 4.4,
    stock: 60,
    image: "phone-case",
    keywords: [
      "phone", "case", "funda", "leather", "iphone", "mobile", "cover",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 16,
    title: "Hydration Trail Vest",
    description: "A light trail vest with two soft flasks and a rear pocket.",
    price: 54.99,
    brand: "Peak",
    category: "sports",
    sku: "LOC-HV-016",
    rating: 4.6,
    stock: 17,
    image: "hydration-vest",
    keywords: [
      "hydration", "vest", "trail", "sports", "chaleco", "hiking",
      "flasks",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 17,
    title: "Yoga Mat",
    description: "A non-slip yoga mat with a carry strap.",
    price: 29.99,
    brand: "Flow",
    category: "sports",
    sku: "LOC-YM-017",
    rating: 4.7,
    stock: 44,
    image: "yoga-mat",
    keywords: [
      "yoga", "mat", "exercise", "esterilla", "fitness", "stretch",
      "workout",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 18,
    title: "Stainless Water Bottle",
    description: "A double-wall stainless bottle that keeps drinks cold.",
    price: 24.99,
    brand: "Clearwell",
    category: "kitchen",
    sku: "LOC-WB-018",
    rating: 4.5,
    stock: 70,
    image: "water-bottle",
    keywords: [
      "bottle", "water", "botella", "stainless", "flask", "hydration",
      "insulated",
    ],
  }),
  product({
    id: LOCAL_CATALOG_ID_BASE + 19,
    title: "Bluetooth Earbuds",
    description: "Compact earbuds with a pocket charging case.",
    price: 59.99,
    brand: "Auralis",
    category: "audio",
    sku: "LOC-EB-019",
    rating: 4.4,
    stock: 38,
    image: "bluetooth-earbuds",
    keywords: [
      "earbuds", "bluetooth", "audio", "auriculares", "in-ear", "music",
      "charging case",
    ],
  }),
];

/** A product the local catalogue owns, or undefined. */
export function localProductById(id: number): LocalProduct | undefined {
  return LOCAL_PRODUCTS.find((product) => product.id === id);
}

/** Whether an id belongs to the local half, so the route can fall back to it. */
export function isLocalProduct(id: number): boolean {
  return id >= LOCAL_CATALOG_ID_BASE;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "only", "when",
  "price", "cost", "size", "color", "colour", "drops", "less", "than",
  "per", "month", "monthly", "want", "need", "buy", "get", "new", "under",
  "dollars", "dollar", "budget", "max", "maximum", "cheap", "best",
  "style", "stylish", "para", "con", "por", "bajo", "menos", "que", "una",
  "uno", "del", "las", "los", "mi", "un", "en", "de", "al", "el", "la",
  "y", "o", "a", "it", "is", "in", "on", "to", "of",
]);

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function terms(query: string): string[] {
  return normalise(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Search the local catalogue.
 *
 * A term matches the title, brand, category or the bilingual keyword list.
 * The result is ordered by how many terms matched and then by price, so the
 * cheapest real match is the first thing a cautious buyer sees.
 */
export function searchLocalCatalog(query: string): LocalProduct[] {
  const wanted = terms(query);
  if (wanted.length === 0) return [];

  return LOCAL_PRODUCTS.map((product) => {
    const haystack = normalise(
      [
        product.title,
        product.brand ?? "",
        product.category,
        ...product.keywords,
      ].join(" ")
    );
    const hits = wanted.filter((term) => haystack.includes(term)).length;
    return { product, hits };
  })
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.product.price - b.product.price)
    .map((entry) => entry.product);
}
