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
import { matchProduct, evaluateCondition, CATALOG_SOURCE } from "@/lib/commerce/catalog";

/**
 * Whether a hold is backed by a real PayPal `authorizeOrder`.
 *
 * Deliberately false until Step 2c wires that call in. Setting it true now
 * would let the UI say money is reserved when nothing has been authorized —
 * the plausible-but-false statement this project has been removing.
 */
const HOLD_IS_BACKED_BY_PAYPAL = false;

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

  return {
    id: p.id,
    what: p.what,
    merchant: p.merchant,
    condition: p.condition,
    limit: p.limit,
    currency: p.currency,
    status: p.status,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const { action, policy: rawPolicy } = body as { action?: unknown; policy?: unknown };

    if (!isHoldAction(action)) {
      return NextResponse.json(
        { success: false, error: "action must be activate, capture or release." },
        { status: 400 }
      );
    }

    const policy = readPolicy(rawPolicy);
    if (typeof policy === "string") {
      return NextResponse.json({ success: false, error: policy }, { status: 400 });
    }

    // Transition legality is shared with the renderer, so the button that
    // offered this action and the rule that accepts it cannot drift apart.
    if (!canPerform(action as HoldAction, policy.status)) {
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
      return NextResponse.json({
        success: true,
        status: STATUS.released,
        log: `↩️ [HOLD] Released "${policy.what}" — ${policy.limit.toFixed(2)} ${policy.currency} returned to the balance.`,
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
      holdMode: HOLD_IS_BACKED_BY_PAYPAL ? "live" : "demo",
      log: `✅ [HOLD] Captured ${policy.limit.toFixed(2)} ${policy.currency} for "${policy.what}". ${evaluation.detail}`,
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
