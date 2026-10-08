// lib/fx/providers.ts
// Server-side fetchers for live FX data. No API keys are used: both sources
// below were verified reachable and CORS-open before being wired up.
//
//   VES/USD    https://rates.dolarvzla.com   BCV + intervention, no key, static JSON
//   PYUSD/USD  https://api.coingecko.com      free tier, no key needed for simple/price
//
// Results are cached by Next for 60s so N browser tabs cost one upstream call.
// CoinGecko's free tier rate-limits aggressively; without this every visitor
// would burn the quota.
import type { FxSnapshot } from "./rates";

const DOLARVZLA_BCV = "https://rates.dolarvzla.com/bcv/current.json";
const DOLARVZLA_INTERVENTION = "https://rates.dolarvzla.com/interventions/current.json";
const COINGECKO = "https://api.coingecko.com/api/v3/simple/price";

const REVALIDATE_SECONDS = 60;

interface BcvPayload {
  current?: { date?: string; usd?: number; eur?: number };
  previous?: { date?: string; usd?: number };
  changePercentage?: { usd?: number };
}

interface InterventionPayload {
  date?: string;
  rate?: number;
}

interface CoinGeckoPayload {
  [id: string]: { usd?: number };
}

/**
 * Fetches a URL and pushes a readable failure into `errors` instead of
 * throwing. A partially populated snapshot beats a total outage, provided the
 * caller can see which piece is missing.
 */
async function getJson<T>(url: string, label: string, errors: string[]): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(`${label}: ${reason}`);
    return null;
  }
}

/** Thrown when the BCV feed — the backbone of every VES conversion — is down. */
export class FxSourceUnavailable extends Error {
  constructor(public readonly detail: string) {
    super(`FX source unavailable: ${detail}`);
    this.name = "FxSourceUnavailable";
  }
}

export async function fetchFxSnapshot(): Promise<FxSnapshot> {
  const errors: string[] = [];

  const [bcv, intervention, pyusd] = await Promise.all([
    getJson<BcvPayload>(DOLARVZLA_BCV, "dolarvzla BCV", errors),
    getJson<InterventionPayload>(DOLARVZLA_INTERVENTION, "dolarvzla intervention", errors),
    // Only the PYUSD peg. SOL was dropped on 08-oct: this product settles in
    // USD/PYUSD, so the converter no longer quotes a coin of its own.
    getJson<CoinGeckoPayload>(`${COINGECKO}?ids=paypal-usd&vs_currencies=usd`, "CoinGecko PYUSD", errors),
  ]);

  const vesPerUsd = bcv?.current?.usd;
  if (vesPerUsd === undefined || !Number.isFinite(vesPerUsd)) {
    // Without the official VES rate every conversion would be a guess. Fail
    // loudly rather than returning a plausible-looking wrong number.
    throw new FxSourceUnavailable(
      errors.length ? errors.join("; ") : "dolarvzla returned no USD rate"
    );
  }

  const pyusdPerUsd = pyusd?.["paypal-usd"]?.usd;

  const snapshot: FxSnapshot = {
    fetchedAt: new Date().toISOString(),
    vesPerUsd,
    vesPerUsdAsOf: bcv?.current?.date ?? new Date().toISOString(),
    vesChangePct: bcv?.changePercentage?.usd,
    previousVesPerUsd: bcv?.previous?.usd,
    previousVesAsOf: bcv?.previous?.date,
    // The CoinGecko pair is authoritative for the PYUSD peg; a miss must be
    // visible rather than quietly replaced by 1.00.
    pyusdPerUsd: pyusdPerUsd !== undefined && Number.isFinite(pyusdPerUsd) ? pyusdPerUsd : NaN,
    pyusdPerUsdAsOf: new Date().toISOString(),
    errors,
  };

  if (intervention?.rate !== undefined) {
    snapshot.vesPerUsdIntervention = intervention.rate;
    snapshot.interventionAsOf = intervention.date ?? new Date().toISOString();
  }

  return snapshot;
}
