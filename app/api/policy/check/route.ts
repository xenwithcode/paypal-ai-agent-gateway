// app/api/policy/check/route.ts
//
// Answers one question: may this charge happen under this policy?
//
// This is the enforcement the product claims, moved out of the browser. The
// console button used to narrate a block after a fixed delay regardless of
// what any policy said; here the attempt is compared against the ceiling, the
// endpoint allow-list, the named recipient and the policy's state, and the
// verdict is the server's.
//
// The rules themselves live in lib/policy.ts as `judgeCharge`. They are here
// only as a shape: this file validates what came over the wire and formats
// what goes back. Splitting it that way is what lets the suite test the
// judgement without booting a Next server, and what stops a rule from being
// written twice — once for the route and once for anything else that asks.

import { NextRequest, NextResponse } from "next/server";
import { isMode, isStatus, judgeCharge } from "@/lib/policy";

/** Mirrors the maxLength on the grid's editable cells. */
const MAX_TEXT = 200;

function isCurrency(value: unknown): value is string {
  return value === "USD" || value === "PYUSD";
}

/** The attempt as it goes to the judge. */
type JudgedCharge = {
  amount: number;
  currency: string;
  endpoint: string;
  payee: string;
  /** Absent when the attempt does not say who started it. */
  initiatedBy?: "human" | "agent";
};

/** The envelope as it goes to the judge. Strings are empty, never missing. */
type JudgedEnvelope = {
  limit: number;
  currency: string;
  allowEndpoint: string;
  what: string;
  status: string;
  payee: string;
  expires: string;
  mode: string;
};

/**
 * Validate the attempt. Returns a plain error string on failure so nothing the
 * client sent is ever echoed back into an error message.
 */
function readAttempt(
  charge: unknown,
  policy: unknown
): { error: string } | { charge: JudgedCharge; policy: JudgedEnvelope } {
  if (!charge || typeof charge !== "object" || Array.isArray(charge)) {
    return { error: "charge must be an object." };
  }
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return { error: "policy must be an object." };
  }

  const c = charge as Record<string, unknown>;
  const p = policy as Record<string, unknown>;

  if (typeof c.amount !== "number" || !Number.isFinite(c.amount) || c.amount <= 0) {
    return { error: "charge.amount must be a positive number." };
  }
  if (!isCurrency(c.currency)) return { error: "charge.currency must be USD or PYUSD." };
  if (typeof c.endpoint !== "string" || c.endpoint.length > MAX_TEXT) {
    return { error: `charge.endpoint must be a string under ${MAX_TEXT} characters.` };
  }

  // Absent reads as "this attempt named no recipient", which is not the same
  // as a malformed request: the fraud button and every caller written before
  // the payee rule existed send no payee at all, and a new rule must not start
  // rejecting payloads that were valid yesterday. A payee that *is* present but
  // is not a string is refused rather than quietly dropped — dropping one would
  // switch the rule off by sending the wrong type.
  if (c.payee !== undefined && c.payee !== null && typeof c.payee !== "string") {
    return { error: "charge.payee must be a string." };
  }
  const chargePayee = typeof c.payee === "string" ? c.payee : "";
  if (chargePayee.length > MAX_TEXT) {
    return { error: `charge.payee must be a string under ${MAX_TEXT} characters.` };
  }

  // Who started it, when the attempt says. A value that is neither word would
  // otherwise read as "no human showed up" — a refusal the caller never asked
  // for, about a field it thought it had answered.
  const rawInitiatedBy = c.initiatedBy;
  if (
    rawInitiatedBy !== undefined &&
    rawInitiatedBy !== null &&
    rawInitiatedBy !== "human" &&
    rawInitiatedBy !== "agent"
  ) {
    return { error: "charge.initiatedBy must be human or agent." };
  }
  const initiatedBy = rawInitiatedBy === "human" || rawInitiatedBy === "agent" ? rawInitiatedBy : undefined;

  if (typeof p.limit !== "number" || !Number.isFinite(p.limit) || p.limit <= 0) {
    return { error: "policy.limit must be a positive number." };
  }
  if (!isCurrency(p.currency)) return { error: "policy.currency must be USD or PYUSD." };
  if (typeof p.allowEndpoint !== "string" || p.allowEndpoint.length > MAX_TEXT) {
    return { error: `policy.allowEndpoint must be a string under ${MAX_TEXT} characters.` };
  }
  if (p.payee !== undefined && p.payee !== null && typeof p.payee !== "string") {
    return { error: "policy.payee must be a string." };
  }
  const policyPayee = typeof p.payee === "string" ? p.payee : "";
  if (policyPayee.length > MAX_TEXT) {
    return { error: `policy.payee must be a string under ${MAX_TEXT} characters.` };
  }
  if (typeof p.what !== "string" || !p.what.trim() || p.what.length > MAX_TEXT) {
    return { error: `policy.what must be a non-empty string under ${MAX_TEXT} characters.` };
  }
  if (!isStatus(p.status)) return { error: "policy.status is not a known status." };

  // The window and the autonomy, both judged rather than rendered. A mode
  // that is not one of the two words would read as "not Copilot" and switch
  // the autonomy rule off by sending the wrong value, so it is refused here
  // where the message can name the field.
  if (p.expires !== undefined && p.expires !== null && typeof p.expires !== "string") {
    return { error: "policy.expires must be a string." };
  }
  const expires = typeof p.expires === "string" ? p.expires : "";
  if (expires.length > MAX_TEXT) {
    return { error: `policy.expires must be a string under ${MAX_TEXT} characters.` };
  }

  if (p.mode !== undefined && p.mode !== null && typeof p.mode !== "string") {
    return { error: "policy.mode must be a string." };
  }
  const mode = typeof p.mode === "string" ? p.mode : "";
  if (mode && !isMode(mode)) {
    return { error: "policy.mode must be Autonomous or Copilot." };
  }

  return {
    charge: {
      amount: c.amount,
      currency: c.currency,
      endpoint: c.endpoint,
      payee: chargePayee,
      initiatedBy,
    },
    policy: {
      limit: p.limit,
      currency: p.currency,
      allowEndpoint: p.allowEndpoint,
      what: p.what,
      status: p.status,
      payee: policyPayee,
      expires,
      mode,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const parsed = readAttempt(
      (body as { charge?: unknown }).charge,
      (body as { policy?: unknown }).policy
    );
    if ("error" in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const { charge, policy } = parsed;
    const { allowed, violations, reason } = judgeCharge(charge, policy);

    return NextResponse.json({
      success: true,
      allowed,
      violations,
      reason,
      // The amount, endpoint and recipient the server actually judged, so the
      // console reports the same values that were checked rather than the ones
      // the button intended to send.
      judged: {
        amount: charge.amount,
        currency: charge.currency,
        endpoint: charge.endpoint,
        payee: charge.payee,
      },
      ceiling: { limit: policy.limit, currency: policy.currency },
      log: allowed
        ? `✅ [CHECK] Allowed: charge of ${charge.amount.toFixed(2)} ${charge.currency} is within "${policy.what}".`
        : `🚨 [BLOCKED] ${violations.join(" ")}`,
    });
  } catch (error) {
    console.error("[/api/policy/check] Unhandled error:", error);
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal error."
        : error instanceof Error
          ? error.message
          : "Unknown error.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
