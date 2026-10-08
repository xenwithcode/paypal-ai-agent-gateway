// lib/fx/rates.ts
// Pure types and conversion math. Shared by the server-side providers, the
// API route and the browser UI, so it must stay free of fetch and side effects.
//
// Everything derives from two published quotes:
//   VES/USD    ← BCV official rate (dolarvzla CDN)
//   PYUSD/USD  ← CoinGecko
// PYUSD/USD is fetched, not assumed: it should sit at 1.00, and showing
// the number means a broken peg is visible instead of silently accepted.
//
// Three currencies, and no fourth. A product that settles through PayPal does
// not quote somebody else's coin: SOL was removed from this file, the provider
// and the screen on 08-oct, so that "the money enters and leaves through
// PayPal" is true of the converter too, not only of the pitch.

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
  /** How many USD buy 1 PYUSD. Expected ≈ 1. */
  pyusdPerUsd: number;
  pyusdPerUsdAsOf: string;
  /**
   * Sources that failed. Never swallowed: the UI shows what is missing so a
   * stale or partial number can never pass as complete truth.
   */
  errors: string[];
}

/** USD · PYUSD · VES. Nothing else — see the header for why the list stops here. */
export type FxCurrency = "VES" | "PYUSD" | "USD";

/** USD value of an amount denominated in `currency`. */
export function toUsd(amount: number, currency: FxCurrency, r: FxSnapshot): number {
  switch (currency) {
    case "USD":
      return amount;
    case "VES":
      return amount / r.vesPerUsd;
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

export const CURRENCIES: FxCurrency[] = ["VES", "PYUSD", "USD"];

export const CURRENCY_LABEL: Record<FxCurrency, string> = {
  VES: "Venezuelan Bolívar",
  PYUSD: "PayPal USD",
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
 * Large VES balances read better without forced decimals; everything else is
 * money at two decimals. (A fourth-decimal branch existed for SOL and went
 * with it.)
 */
export function formatSmart(value: number, currency: FxCurrency): string {
  if (!Number.isFinite(value)) return "—";
  if (currency === "VES" && Math.abs(value) >= 1000) {
    return Math.round(value).toLocaleString("en-US");
  }
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
