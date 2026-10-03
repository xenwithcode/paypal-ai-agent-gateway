// lib/fx/rates.ts
// Pure types and conversion math. Shared by the server-side providers, the
// API route and the browser UI, so it must stay free of fetch and side effects.
//
// Everything derives from two published quotes:
//   VES/USD  ← BCV official rate (dolarvzla CDN)
//   SOL/USD  ← CoinGecko
// PYUSD/USD is fetched too, not assumed: it should sit at 1.00, and showing
// the number means a broken peg is visible instead of silently accepted.

export interface FxSnapshot {
  /** When our process fetched this, ISO 8601. */
  fetchedAt: string;
  /** How many VES buy 1 USD. BCV official publication. */
  vesPerUsd: number;
  vesPerUsdAsOf: string;
  /** BCV intervention rate, when one has been published. */
  vesPerUsdIntervention?: number;
  interventionAsOf?: string;
  /** BCV change against the previous publication, in percent. */
  vesChangePct?: number;
  previousVesPerUsd?: number;
  previousVesAsOf?: string;
  /** How many USD buy 1 SOL. */
  solPerUsd: number;
  solPerUsdAsOf: string;
  /** How many USD buy 1 PYUSD. Expected ≈ 1. */
  pyusdPerUsd: number;
  pyusdPerUsdAsOf: string;
  /**
   * Sources that failed. Never swallowed: the UI shows what is missing so a
   * stale or partial number can never pass as complete truth.
   */
  errors: string[];
}

export type FxCurrency = "VES" | "PYUSD" | "SOL" | "USD";

/** USD value of an amount denominated in `currency`. */
export function toUsd(amount: number, currency: FxCurrency, r: FxSnapshot): number {
  switch (currency) {
    case "USD":
      return amount;
    case "VES":
      return amount / r.vesPerUsd;
    case "SOL":
      return amount * r.solPerUsd;
    case "PYUSD":
      return amount * r.pyusdPerUsd;
  }
}

/** Amount of `currency` whose USD value is `usd`. */
export function fromUsd(usd: number, currency: FxCurrency, r: FxSnapshot): number {
  switch (currency) {
    case "USD":
      return usd;
    case "VES":
      return usd * r.vesPerUsd;
    case "SOL":
      return usd / r.solPerUsd;
    case "PYUSD":
      return usd / r.pyusdPerUsd;
  }
}

/** Convert between any two supported currencies through USD. */
export function convert(
  amount: number,
  from: FxCurrency,
  to: FxCurrency,
  r: FxSnapshot
): number {
  if (from === to) return amount;
  return fromUsd(toUsd(amount, from, r), to, r);
}

export const CURRENCIES: FxCurrency[] = ["VES", "PYUSD", "SOL", "USD"];

export const CURRENCY_LABEL: Record<FxCurrency, string> = {
  VES: "Venezuelan Bolívar",
  PYUSD: "PayPal USD",
  SOL: "Solana",
  USD: "US Dollar",
};

/** Money and prices: always two decimals, thousands separated. */
export function formatAmount(value: number, maxFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFractionDigits,
  });
}

/**
 * Large VES balances read better without forced decimals, but small SOL
 * amounts need them, so the default is picked by magnitude.
 */
export function formatSmart(value: number, currency: FxCurrency): string {
  if (!Number.isFinite(value)) return "—";
  if (currency === "VES" && Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString("en-US");
  }
  if (currency === "SOL") return formatAmount(value, 4);
  return formatAmount(value, 2);
}

/** A rate is only trustworthy with the moment it was published. */
export function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
