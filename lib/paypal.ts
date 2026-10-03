// lib/paypal.ts
// Single facade over the PayPal Server SDK.
// Exposes the shared `paypalClient` and `getBalance()`, which returns the
// figure together with its currency and whether PayPal actually produced it.
// There is no accessor that hands back the number alone.
//
// SECURITY: this module reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET and must
// only ever be imported from server-side code (route handlers, server
// components). Never import it from a "use client" file — there is no
// NEXT_PUBLIC_ prefix on these vars, but a client import would still bundle
// whatever it touches.
import {
  Client,
  Environment,
  TransactionSearchController,
  type BalancesResponse,
} from "@paypal/paypal-server-sdk";

const PAYPAL_ENVIRONMENT =
  process.env.PAYPAL_ENVIRONMENT === "Production"
    ? Environment.Production
    : Environment.Sandbox;

export const paypalClient = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: process.env.PAYPAL_CLIENT_ID ?? "",
    oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
  },
  timeout: 15_000,
  environment: PAYPAL_ENVIRONMENT,
});

/**
 * Demo balance. Used only when `.env.local` still holds the README
 * placeholders or when the PayPal API errors, so the dashboard can always
 * render instead of crashing.
 */
const DEMO_BALANCE = "2,480.00";

/** Returns false while `.env.local` still contains README placeholders. */
export function hasRealPaypalCredentials(): boolean {
  const id = process.env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim() ?? "";

  if (!id || !secret) return false;
  // README placeholders look like "Tu_Client_Id_Sandbox_De_PayPal".
  if (/^Tu[_-]/i.test(id) || /^Tu[_-]/i.test(secret)) return false;
  // A real PayPal sandbox Client Id starts with "A" and is well over 20 chars.
  if (id.length < 20 || secret.length < 20) return false;

  return true;
}

let warnedAboutDemoMode = false;

function warnOnce(reason: string) {
  if (warnedAboutDemoMode) return;
  warnedAboutDemoMode = true;
  console.warn(
    `\n⚠️  [PayPal] getBalance() is returning the DEMO balance (${DEMO_BALANCE} PYUSD).\n` +
      `    Reason: ${reason}\n` +
      `    Credentials come from https://developer.paypal.com — and the app must also\n` +
      `    have the Transaction Search permission enabled, or PayPal answers 403.\n`
  );
}

/**
 * Describe an SDK failure without printing what the request carried.
 *
 * The thrown error carries the full request, bearer token included, so
 * serializing it would put a credential in the server log. It also has an
 * empty `message`, which is why failures used to be reported as `failed ()`
 * with no way to tell a bad key from a missing permission.
 */
function describePaypalError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const failure = error as {
    statusCode?: number;
    message?: string;
    result?: { name?: string; message?: string };
  };
  const parts = [
    typeof failure.statusCode === "number" ? `HTTP ${failure.statusCode}` : "",
    failure.result?.message ?? failure.result?.name ?? failure.message ?? "",
  ].filter(Boolean);
  return parts.join(" — ") || "no detail returned";
}

/** Where a balance figure came from. Carried with it, never implied. */
export type Balance = {
  value: string;
  currency: string;
  source: "live" | "demo";
  /** Why it is a demo figure, so the screen can say so. Null when live. */
  reason: string | null;
};

/**
 * Reads the real balance via Transaction Search API v1.
 *
 * Never throws: if PayPal is unconfigured or refuses, it falls back to the
 * demo figure — and reports which one it is, because a number with no
 * provenance is a number a reader will take at face value.
 *
 * There is deliberately no way to get the figure without its provenance: the
 * callers that only need a number take `.value`, but they have to acknowledge
 * what they are holding first.
 */
export async function getBalance(): Promise<Balance> {
  if (!hasRealPaypalCredentials()) {
    warnOnce("PayPal credentials are missing or still README placeholders.");
    return {
      value: DEMO_BALANCE,
      currency: "PYUSD",
      source: "demo",
      reason: "No PayPal credentials configured.",
    };
  }

  try {
    const controller = new TransactionSearchController(paypalClient);
    // No currencyCode: list every balance and pick the relevant one below.
    // Asking for PYUSD specifically is not an option — this endpoint answers
    // 400 for it, so an account holding only USD reports USD.
    const { result } = await controller.searchBalances({});
    const picked = pickBalance(result);

    if (picked === null) {
      warnOnce("PayPal returned no usable balance.");
      return {
        value: DEMO_BALANCE,
        currency: "PYUSD",
        source: "demo",
        reason: "PayPal returned no usable balance.",
      };
    }
    return { value: picked.value, currency: picked.currency, source: "live", reason: null };
  } catch (error) {
    const why = describePaypalError(error);
    warnOnce(`the PayPal API call failed (${why}).`);
    return {
      value: DEMO_BALANCE,
      currency: "PYUSD",
      source: "demo",
      reason: `PayPal: ${why}`,
    };
  }
}

/**
 * The amount held by one balance entry.
 *
 * The wire format is snake_case (`total_balance`); the SDK deserializes it
 * into the camelCase its `BalancesResponse` type declares, and that is what
 * reaches here. Both spellings are read because they sit one refactor apart —
 * and because missing the number does not throw, it comes back as "no usable
 * balance", the one failure nobody can diagnose from its message.
 */
function entryAmount(entry: Record<string, unknown>): string | null {
  const money =
    (entry.available_balance as { value?: string } | undefined) ??
    (entry.total_balance as { value?: string } | undefined) ??
    (entry.availableBalance as { value?: string } | undefined) ??
    (entry.totalBalance as { value?: string } | undefined);
  return money?.value ?? null;
}

/**
 * Choose the balance to report: PYUSD if the account holds any, else its
 * primary currency. Returns the currency with the figure because labelling
 * a USD balance as PYUSD is the kind of error this project keeps removing.
 */
export function pickBalance(response: BalancesResponse): { value: string; currency: string } | null {
  const entries = (response.balances ?? []) as unknown as Array<Record<string, unknown>>;
  if (entries.length === 0) return null;

  const chosen =
    entries.find((e) => String(e.currency ?? "").toUpperCase() === "PYUSD") ??
    entries.find((e) => e.primary === true) ??
    entries[0];

  const currency = typeof chosen.currency === "string" ? chosen.currency.toUpperCase() : "";
  const value = entryAmount(chosen);
  if (!currency || value === null) return null;

  return { value: formatAmount(value), currency };
}

/** "2480" / "2480.0000" → "2,480.00" for display. */
function formatAmount(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
