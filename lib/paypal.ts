// lib/paypal.ts
// Single facade over the PayPal Server SDK.
// Exposes two things: the shared `paypalClient` and `getPYUSDBalance()`.
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
    `\n⚠️  [PayPal] getPYUSDBalance() is returning the DEMO balance (${DEMO_BALANCE} PYUSD).\n` +
      `    Reason: ${reason}\n` +
      `    To use real data, set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local\n` +
      `    with credentials from https://developer.paypal.com\n`
  );
}

/**
 * Queries the real balance via Transaction Search API v1.
 * Never throws: if PayPal is unconfigured or errors, it falls back to the demo
 * balance so the dashboard render never fails.
 */
export async function getPYUSDBalance(): Promise<string> {
  if (!hasRealPaypalCredentials()) {
    warnOnce("PayPal credentials are missing or still README placeholders.");
    return DEMO_BALANCE;
  }

  try {
    const controller = new TransactionSearchController(paypalClient);
    // No currencyCode: list every balance and pick the relevant one below.
    const { result } = await controller.searchBalances({});
    const formatted = pickBalance(result);

    if (formatted === null) {
      warnOnce("PayPal returned no usable balance.");
      return DEMO_BALANCE;
    }
    return formatted;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnOnce(`the PayPal API call failed (${message}).`);
    return DEMO_BALANCE;
  }
}

/** Extracts and formats the PYUSD (or else primary) balance from the response. */
function pickBalance(response: BalancesResponse): string | null {
  const balances = response.balances;
  if (!balances || balances.length === 0) return null;

  const preferred =
    balances.find((b) => b.currency.toUpperCase() === "PYUSD") ??
    balances.find((b) => b.primary) ??
    balances[0];

  const money = preferred.availableBalance ?? preferred.totalBalance;
  if (!money?.value) return null;

  return formatAmount(money.value);
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
