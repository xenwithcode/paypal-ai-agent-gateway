// app/api/holds/route.ts
//
// Transitions between the states of a purchase order: activate, capture,
// release.
//
// Why this exists on the server at all: the grid already knows the row, and it
// would have been less code to flip a field in the browser. The point of the
// product is that the verdict is not the client's to make, so the server
// re-resolves the catalog entry and re-judges the condition itself every time
// a capture is requested. The browser reports what it wants; it does not get
// to declare that its condition is satisfied.
//
// Scope note: the row still lives in the browser (there is no persistence
// yet), so the server validates the transition and judges the condition — it
// does not yet own the hold record itself. Persistence is tracked separately
// in the session notes.

import { NextRequest, NextResponse } from "next/server";
import {
  STATUS,
  canPerform,
  isHoldAction,
  isStatus,
  statusAfterActivate,
  type HoldAction,
} from "@/lib/policy";
import {
  matchProduct,
  evaluateCondition,
  findWithinBudget,
  CATALOG_SOURCE,
} from "@/lib/commerce/catalog";
import { captureAuthorization, voidAuthorization } from "@/lib/paypal";

/** PayPal ids are a short alphanumeric run; anything else is not one. */
const PAYPAL_ID = /^[A-Z0-9]{10,40}$/i;

/**
 * How a settlement actually happened.
 *
 * Determined per request rather than by a flag: a hold carries an
 * authorization id only when PayPal issued one, and saying `live` for one that
 * has none would be the exact claim this project keeps removing.
 */
type HoldMode = "live" | "demo";

/**
 * A hold settles through PayPal only when the payer approved one — which is
 * exactly when the row carries an authorization id. Without it, the decision
 * is still recorded and the log says plainly that no funds moved.
 */
function holdNote(mode: HoldMode, authorizationId: string, after: string): string {
  return mode === "live" ? ` PayPal ${authorizationId} → ${after}.` : " No funds moved.";
}

/** Mirrors the maxLength on the grid's editable cells. */
const MAX_TEXT = 200;

interface PolicyInput {
  id: number;
  what: string;
  merchant: string;
  condition: string;
  limit: number;
  currency: string;
  status: string;
  /** PayPal's authorization id, present only when the payer approved a hold. */
  authorizationId: string;
}

/** How each action reads in the past tense, for refusal messages. */
const PAST_TENSE: Record<HoldAction, string> = {
  activate: "activated",
  capture: "captured",
  release: "released",
};

/**
 * Parse the policy the client claims to be acting on.
 *
 * Returns a plain error string on failure so the caller can answer 400 without
 * ever echoing the raw payload back — reflecting user input into an error
 * message is how reflected-injection bugs are born.
 */
function readPolicy(value: unknown): PolicyInput | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "policy must be an object.";
  }
  const p = value as Record<string, unknown>;

  if (typeof p.id !== "number" || !Number.isFinite(p.id)) return "policy.id must be a number.";
  if (typeof p.what !== "string" || !p.what.trim() || p.what.length > MAX_TEXT) {
    return `policy.what must be a non-empty string under ${MAX_TEXT} characters.`;
  }
  if (typeof p.merchant !== "string" || p.merchant.length > MAX_TEXT) {
    return `policy.merchant must be a string under ${MAX_TEXT} characters.`;
  }
  if (typeof p.condition !== "string" || p.condition.length > MAX_TEXT) {
    return `policy.condition must be a string under ${MAX_TEXT} characters.`;
  }
  if (typeof p.limit !== "number" || !Number.isFinite(p.limit) || p.limit <= 0) {
    return "policy.limit must be a positive number.";
  }
  if (p.currency !== "USD" && p.currency !== "PYUSD") {
    return "policy.currency must be USD or PYUSD.";
  }
  if (!isStatus(p.status)) return "policy.status is not a known status.";

  // Optional: present only when PayPal issued one. Anything that is not an id
  // is refused rather than passed through to a PayPal call.
  const authorizationId = p.authorizationId;
  if (
    authorizationId !== undefined &&
    (typeof authorizationId !== "string" ||
      (authorizationId !== "" && !PAYPAL_ID.test(authorizationId)))
  ) {
    return "policy.authorizationId is not a PayPal id.";
  }

  return {
    id: p.id,
    what: p.what,
    merchant: p.merchant,
    condition: p.condition,
    limit: p.limit,
    currency: p.currency,
    status: p.status,
    authorizationId: typeof authorizationId === "string" ? authorizationId : "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const { action: rawAction, policy: rawPolicy } = body as { action?: unknown; policy?: unknown };

    // `evaluate` is the read-only one: re-resolve the catalog entry and report
    // what the condition looks like now, without touching the hold.
    const action: HoldAction | "evaluate" | null =
      rawAction === "evaluate" ? "evaluate" : isHoldAction(rawAction) ? rawAction : null;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "action must be activate, capture, release or evaluate." },
        { status: 400 }
      );
    }

    const policy = readPolicy(rawPolicy);
    if (typeof policy === "string") {
      return NextResponse.json({ success: false, error: policy }, { status: 400 });
    }

    // ---------------------------------------------------------------- evaluate
    // A row restored from storage still carries the verdict it had when it was
    // last judged, and a price read at draft time is not still the price. This
    // refreshes it without implying that anything was settled.
    if (action === "evaluate") {
      const { product, matchedBy } = await matchProduct(
        `${policy.what} ${policy.merchant}`.trim()
      );
      const evaluation = evaluateCondition(policy.condition, product);

      // Alternatives are worth fetching exactly when the match is out of
      // budget — that is the only moment the agent has something to propose
      // instead of a refusal.
      const alternatives =
        product && product.price > policy.limit
          ? await findWithinBudget(product, policy.limit)
          : [];

      return NextResponse.json({
        success: true,
        conditionMet: evaluation.met,
        marketPrice: product ? Number(product.price.toFixed(2)) : null,
        // The full record the approval card renders: image, specs, lead time,
        // returns — read at the moment the operator is looking, not at draft.
        product,
        alternatives,
        source: product ? CATALOG_SOURCE : null,
        conditionDetail: product
          ? `${evaluation.detail} · ${matchedBy} on ${CATALOG_SOURCE.name} (${CATALOG_SOURCE.kind})`
          : evaluation.detail,
      });
    }

    // Transition legality is shared with the renderer, so the button that
    // offered this action and the rule that accepts it cannot drift apart.
    if (!canPerform(action, policy.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `A policy that is "${policy.status}" cannot be ${PAST_TENSE[action]}.`,
        },
        { status: 409 }
      );
    }

    // ---------------------------------------------------------------- activate
    if (action === "activate") {
      const nextStatus = statusAfterActivate(policy.condition);
      const held = nextStatus === STATUS.reserved;

      return NextResponse.json({
        success: true,
        status: nextStatus,
        log: held
          ? `🔒 [HOLD] ${policy.limit.toFixed(2)} ${policy.currency} reserved for "${policy.what}" — waiting on ${policy.condition}`
          : `🟢 [POLICY] "${policy.what}" is now active. Ceiling: ${policy.limit.toFixed(2)} ${policy.currency}.`,
      });
    }

    // ------------------------------------------------------------------ release
    if (action === "release") {
      let mode: HoldMode = "demo";
      let after = "";
      if (policy.authorizationId) {
        try {
          const voided = await voidAuthorization(policy.authorizationId);
          mode = "live";
          after = `${policy.authorizationId} (${voided.status})`;
        } catch (error) {
          return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "PayPal refused to void the hold." },
            { status: 502 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        status: STATUS.released,
        holdMode: mode,
        log: `↩️ [HOLD] Released "${policy.what}" — ${policy.limit.toFixed(2)} ${policy.currency} returned.${holdNote(mode, policy.authorizationId, after)}`,
      });
    }

    // ------------------------------------------------------------------- capture
    // A capture may only happen if the condition holds right now — and this is
    // where the server judges, re-resolving the catalog instead of trusting the
    // verdict the row happened to be carrying.
    if (!policy.condition.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "This policy holds no condition, so there is nothing to settle.",
        },
        { status: 409 }
      );
    }

    const { product, matchedBy } = await matchProduct(
      `${policy.what} ${policy.merchant}`.trim()
    );
    const evaluation = evaluateCondition(policy.condition, product);

    if (evaluation.met !== true) {
      const reason =
        evaluation.met === false
          ? `The condition is not satisfied: ${evaluation.detail}`
          : `The condition cannot be verified: ${evaluation.detail}`;
      return NextResponse.json(
        {
          success: false,
          error: reason,
          conditionMet: evaluation.met,
          conditionDetail: product
            ? `${evaluation.detail} · ${matchedBy} on ${CATALOG_SOURCE.name} (${CATALOG_SOURCE.kind})`
            : evaluation.detail,
        },
        { status: 409 }
      );
    }

    // The ceiling is enforced whether or not the policy carried a condition.
    // A policy with a limit of 80 and no condition still may not be settled
    // for 119.99 — otherwise the one rule every order has would be the only
    // one nothing checks.
    const settledPrice = product ? product.price : null;
    if (settledPrice !== null && settledPrice > policy.limit) {
      return NextResponse.json(
        {
          success: false,
          error: `The price is ${settledPrice.toFixed(2)} ${policy.currency}, above the ${policy.limit.toFixed(2)} ${policy.currency} ceiling.`,
        },
        { status: 409 }
      );
    }

    // This is the moment money moves — and only if PayPal is holding any.
    let mode: HoldMode = "demo";
    let after = "";
    if (policy.authorizationId) {
      try {
        const captured = await captureAuthorization(policy.authorizationId);
        mode = "live";
        after = `${captured.captureId || policy.authorizationId} (${captured.status})`;
      } catch (error) {
        // A capture PayPal refuses is a refusal, not a success to soften.
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : "PayPal refused the capture." },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      status: STATUS.captured,
      conditionMet: evaluation.met,
      // The price moves with the verdict: this is a fresh read, not the one
      // taken when the order was drafted.
      marketPrice: product ? Number(product.price.toFixed(2)) : null,
      conditionDetail: product
        ? `${evaluation.detail} · ${matchedBy} on ${CATALOG_SOURCE.name} (${CATALOG_SOURCE.kind})`
        : evaluation.detail,
      holdMode: mode,
      log: `✅ [HOLD] Captured ${policy.limit.toFixed(2)} ${policy.currency} for "${policy.what}". ${evaluation.detail}${holdNote(mode, policy.authorizationId, after)}`,
    });
  } catch (error) {
    // Full detail to the server log only; the browser gets a generic message.
    console.error("[/api/holds] Unhandled error:", error);
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal error."
        : error instanceof Error
          ? error.message
          : "Unknown error.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
