// app/api/policy/check/route.ts
//
// Answers one question: may this charge happen under this policy?
//
// This is the enforcement the product claims, moved out of the browser. The
// console button used to narrate a block after a fixed delay regardless of
// what any policy said; here the attempt is compared against the ceiling, the
// endpoint allow-list and the policy's state, and the verdict is the
// server's. Every violation found is reported, not just the first, because an
// approver who only hears about the amount will fix the amount and re-run
// straight into the endpoint rule.
//
// Deliberately does not judge price conditions — settling a condition is
// /api/holds' job. Keeping the two apart means neither has to know whether the
// other has run.

import { NextRequest, NextResponse } from "next/server";
import { STATUS, isStatus } from "@/lib/policy";

/** Statuses under which a charge against this policy may be attempted at all. */
const SPENDABLE_STATUSES: readonly string[] = [STATUS.enforced, STATUS.reserved];

/** Mirrors the maxLength on the grid's editable cells. */
const MAX_TEXT = 200;

function isCurrency(value: unknown): value is string {
  return value === "USD" || value === "PYUSD";
}

/**
 * Validate the attempt. Returns a plain error string on failure so nothing the
 * client sent is ever echoed back into an error message.
 */
function readAttempt(
  charge: unknown,
  policy: unknown
): { error: string } | { charge: { amount: number; currency: string; endpoint: string }; policy: { limit: number; currency: string; allowEndpoint: string; what: string; status: string } } {
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

  if (typeof p.limit !== "number" || !Number.isFinite(p.limit) || p.limit <= 0) {
    return { error: "policy.limit must be a positive number." };
  }
  if (!isCurrency(p.currency)) return { error: "policy.currency must be USD or PYUSD." };
  if (typeof p.allowEndpoint !== "string" || p.allowEndpoint.length > MAX_TEXT) {
    return { error: `policy.allowEndpoint must be a string under ${MAX_TEXT} characters.` };
  }
  if (typeof p.what !== "string" || !p.what.trim() || p.what.length > MAX_TEXT) {
    return { error: `policy.what must be a non-empty string under ${MAX_TEXT} characters.` };
  }
  if (!isStatus(p.status)) return { error: "policy.status is not a known status." };

  return {
    charge: { amount: c.amount, currency: c.currency, endpoint: c.endpoint },
    policy: {
      limit: p.limit,
      currency: p.currency,
      allowEndpoint: p.allowEndpoint,
      what: p.what,
      status: p.status,
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
    const violations: string[] = [];

    // 1. Is the policy even armed? Nothing under draft or already settled may
    //    be charged, and the reason has to say so rather than failing vaguely.
    if (!SPENDABLE_STATUSES.includes(policy.status)) {
      violations.push(
        policy.status === STATUS.pending
          ? `The policy for "${policy.what}" has not been activated yet.`
          : `The policy for "${policy.what}" is ${policy.status}, so it no longer permits charges.`
      );
    }

    // 2. The ceiling.
    if (charge.currency !== policy.currency) {
      violations.push(
        `Currency mismatch: the charge is in ${charge.currency} but the ceiling is in ${policy.currency}.`
      );
    } else if (charge.amount > policy.limit) {
      violations.push(
        `Amount ${charge.amount.toFixed(2)} ${charge.currency} exceeds the ${policy.limit.toFixed(2)} ${policy.currency} ceiling.`
      );
    }

    // 3. The destination. An empty allow-list means no merchant was named and
    //    therefore nothing is restricted — stated plainly rather than implied.
    if (policy.allowEndpoint && charge.endpoint && charge.endpoint !== policy.allowEndpoint) {
      violations.push(
        `Endpoint ${charge.endpoint} is not allowed for this order (only ${policy.allowEndpoint}).`
      );
    }

    const allowed = violations.length === 0;

    return NextResponse.json({
      success: true,
      allowed,
      violations,
      reason: allowed
        ? `Charge of ${charge.amount.toFixed(2)} ${charge.currency} is within "${policy.what}".`
        : violations.join(" "),
      // The amount and endpoint the server actually judged, so the console
      // reports the same numbers that were checked rather than the ones the
      // button intended to send.
      judged: { amount: charge.amount, currency: charge.currency, endpoint: charge.endpoint },
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
