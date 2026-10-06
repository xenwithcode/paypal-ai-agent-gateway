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
  CheckoutPaymentIntent,
  Environment,
  OrdersController,
  PaymentsController,
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
 * What the transaction history request came back with, and how to read it.
 *
 * `rows` holds the records exactly as PayPal returned them — nothing renamed,
 * nothing flattened, because the whole point of showing them is that they are
 * somebody else's answer rather than ours.
 */
export type TransactionsResult = {
  rows: Record<string, unknown>[];
  /** `live` means PayPal answered. Anything else means it did not. */
  source: "live" | "unavailable";
  /** Plain reason when `source` is "unavailable". Never a stack trace. */
  reason: string | null;
  /** The window actually asked for. Transaction Search refuses more than 31 days. */
  window: { startDate: string; endDate: string };
};

/**
 * The account's own record of what moved, for the last 30 days.
 *
 * This is the third ledger, and the other two are not a substitute for it:
 * `lib/history.ts` holds what the policy *allowed* and what it *stopped*, and
 * neither of those is the same question as what PayPal actually settled. This
 * one is also the only record of the three this browser cannot edit.
 *
 * Two limits come with the answer rather than living in a comment. The window
 * is at most 31 days, and new activity can take up to three hours to appear —
 * a row that is three hours stale looks exactly like one that is current, so
 * the reader is told which window was asked for instead of being left to
 * assume "recent" means "now".
 *
 * Never throws: an unconfigured account and a refused request both come back
 * as `source: "unavailable"` with a reason, because an empty table and a table
 * we could not ask for are different things — and only one of them means "you
 * have no transactions".
 */
export async function getRecentTransactions(): Promise<TransactionsResult> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const window = { startDate: startDate.toISOString(), endDate: endDate.toISOString() };

  if (!hasRealPaypalCredentials()) {
    warnOnce("PayPal credentials are missing or still README placeholders.");
    return {
      rows: [],
      source: "unavailable",
      reason: "No PayPal credentials configured.",
      window,
    };
  }

  try {
    const { result } = await new TransactionSearchController(paypalClient).searchTransactions({
      startDate: window.startDate,
      endDate: window.endDate,
      // Without this only `transactionInfo` comes back. The payer and shipping
      // sections are what make the nesting worth showing a grid for.
      fields: "all",
      pageSize: 20,
    });
    const rows = (result.transactionDetails ?? []) as unknown as Record<string, unknown>[];
    return { rows, source: "live", reason: null, window };
  } catch (error) {
    const why = describePaypalError(error);
    warnOnce(`the PayPal transactions call failed (${why}).`);
    return { rows: [], source: "unavailable", reason: `PayPal: ${why}`, window };
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

// ─── The hold lifecycle, in PayPal's terms ─────────────────────────────────
//
// Our states map onto PayPal's authorize model one for one:
//
//   activate  → createOrder(intent: AUTHORIZE) → payer approves → authorizeOrder
//   capture   → captureAuthorizedPayment(authorizationId)
//   release   → voidAuthorization(authorizationId)
//
// PayPal's own guidance on this shape is worth keeping close: "inform
// customers that their payment is authorized, but not yet charged" — which is
// what the Reserved state says. The hold is real for 29 days, with the best
// success inside a 3-day honor period.

/** Money as PayPal accepts it: a positive decimal string, not a number. */
export function toMoneyString(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
}

/** True when the app can reach PayPal at all. */
export function canTalkToPaypal(): boolean {
  return hasRealPaypalCredentials();
}

function orders() {
  return new OrdersController(paypalClient);
}

function payments() {
  return new PaymentsController(paypalClient);
}

/** Translate an SDK failure into something a person can act on. */
function fail(operation: string, error: unknown): never {
  const reason = describePaypalError(error);
  console.error(`[/paypal] ${operation} failed: ${reason}`);
  throw new Error(`${operation} failed: ${reason}`);
}

export type CreatedOrder = {
  orderId: string;
  /** Where the payer approves — the sandbox checkout page. */
  approveUrl: string | null;
  status: string;
};

/**
 * Create an order that reserves funds rather than taking them.
 *
 * `intent: AUTHORIZE` is the whole point: without it there is nothing for a
 * condition to gate, because the money would already have moved.
 *
 * `payeeEmail` is the other half of the envelope: naming it here means PayPal
 * itself directs the funds to that account, so the destination is fixed at the
 * moment the order is created rather than being something a later call could
 * redirect. Omitting it leaves the recipient to the default — which is only
 * correct while no recipient has been named.
 */
export async function createAuthorizeOrder(input: {
  amount: string;
  currency: string;
  description: string;
  customId?: string;
  payeeEmail?: string;
}): Promise<CreatedOrder> {
  if (!hasRealPaypalCredentials()) {
    throw new Error("PayPal credentials are not configured.");
  }

  const payeeEmail = input.payeeEmail?.trim();

  try {
    const { result } = await orders().createOrder({
      body: {
        intent: CheckoutPaymentIntent.Authorize,
        purchaseUnits: [
          {
            amount: { currencyCode: input.currency, value: input.amount },
            description: input.description.slice(0, 120),
            ...(input.customId ? { customId: input.customId.slice(0, 127) } : {}),
            // `payee` sits on the purchase unit, not on the order: PayPal
            // models it as "the merchant this unit pays", which is what makes
            // it the place a recipient belongs.
            ...(payeeEmail ? { payee: { emailAddress: payeeEmail } } : {}),
          },
        ],
        applicationContext: {
          brandName: "PayPal AI Agent Gateway",
          // The SDK v6 flow approves in-page and never navigates away, but
          // PayPal requires both URLs to be present to accept the order.
          returnUrl: process.env.PAYPAL_RETURN_URL ?? "http://localhost:3001/paypal/return",
          cancelUrl: process.env.PAYPAL_CANCEL_URL ?? "http://localhost:3001/paypal/cancel",
        },
      },
    });

    const approve = (result.links ?? []).find((link) => link.rel === "approve");
    if (!result.id) throw new Error("PayPal returned no order id.");

    return { orderId: result.id, approveUrl: approve?.href ?? null, status: result.status ?? "CREATED" };
  } catch (error) {
    fail("createAuthorizeOrder", error);
  }
}

/**
 * Complete the approval the payer just gave, producing the hold.
 *
 * The authorization id lives at `purchase_units[0].payments.authorizations[0].id`
 * in PayPal's response; everything after this point refers to it by name.
 */
export async function authorizeApprovedOrder(orderId: string): Promise<{
  authorizationId: string;
  status: string;
}> {
  if (!orderId.trim()) throw new Error("An order id is required.");
  if (!hasRealPaypalCredentials()) {
    throw new Error("PayPal credentials are not configured.");
  }

  try {
    const { result } = await orders().authorizeOrder({ id: orderId });

    // PayPal's response shape, per its own docs: the authorization id sits at
    // purchase_units[0].payments.authorizations[0]. Everything after this
    // point — capture, void, reauthorize — refers to it by that name.
    const authorization = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];
    const authorizationId = authorization?.id ?? "";

    if (!authorizationId) {
      throw new Error("PayPal returned no authorization — the order may not be approved yet.");
    }
    return { authorizationId, status: result.status ?? "APPROVED" };
  } catch (error) {
    fail("authorizeApprovedOrder", error);
  }
}

/** Settle the hold: this is when money actually moves. */
export async function captureAuthorization(authorizationId: string): Promise<{
  captureId: string;
  status: string;
}> {
  if (!authorizationId.trim()) throw new Error("An authorization id is required.");
  if (!hasRealPaypalCredentials()) {
    throw new Error("PayPal credentials are not configured.");
  }

  try {
    const { result } = await payments().captureAuthorizedPayment({ authorizationId });
    return {
      captureId: (result as { id?: string })?.id ?? "",
      status: (result as { status?: string })?.status ?? "COMPLETED",
    };
  } catch (error) {
    fail("captureAuthorization", error);
  }
}

/** Cancel the hold: the funds are released back to the payer. */
export async function voidAuthorization(authorizationId: string): Promise<{ status: string }> {
  if (!authorizationId.trim()) throw new Error("An authorization id is required.");
  if (!hasRealPaypalCredentials()) {
    throw new Error("PayPal credentials are not configured.");
  }

  try {
    const { result } = await payments().voidPayment({ authorizationId });
    return { status: (result as { status?: string })?.status ?? "VOIDED" };
  } catch (error) {
    fail("voidAuthorization", error);
  }
}
