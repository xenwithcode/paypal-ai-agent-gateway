// app/api/paypal/orders/route.ts
//
// Two steps of the hold lifecycle, in PayPal's own terms:
//
//   create   → an order with intent AUTHORIZE. Nothing is taken; funds are
//              reserved once the payer approves it.
//   authorize→ complete that approval, producing the authorization id every
//              later capture or void refers to.
//
// Both run here rather than in the browser because PayPal's own guidance is
// unambiguous — "never create orders in the browser" — and because the
// decision to hold money belongs on the same side of the wire that judges
// whether a condition holds.

import { NextRequest, NextResponse } from "next/server";
import { isMode, isStatus, judgeHoldRequest, type PolicyEnvelope } from "@/lib/policy";
import { campaignIdFromCustomId, judgeInvestment } from "@/lib/crowdfunding";
import { findCampaign } from "@/lib/campaigns";
import {
  authorizeApprovedOrder,
  canTalkToPaypal,
  createAuthorizeOrder,
} from "@/lib/paypal";

/** Mirrors the maxLength on the grid's editable cells. */
const MAX_TEXT = 200;

/** PayPal order ids are a short alphanumeric run; anything else is not one. */
const ORDER_ID = /^[A-Z0-9]{10,40}$/i;

/**
 * An address PayPal will accept as a payee.
 *
 * Deliberately permissive about the local part and strict about the shape: the
 * goal is to stop a typo reaching PayPal and coming back as an opaque 4xx, not
 * to re-implement address validation PayPal has its own opinions about.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Read the recipient off the request.
 *
 * Returns the trimmed address, or a plain reason to refuse. An absent payee is
 * valid — most orders do not name one — but a present one that is malformed is
 * refused here, where the message can name the field, rather than by PayPal.
 */
function readPayee(value: unknown): { error: string } | { payeeEmail: string } {
  if (value === undefined || value === null || value === "") return { payeeEmail: "" };
  if (typeof value !== "string") return { error: "payeeEmail must be a string." };
  const email = value.trim();
  if (email.length > 254) return { error: "payeeEmail is too long." };
  if (!EMAIL.test(email)) return { error: "payeeEmail must be an email address." };
  return { payeeEmail: email };
}

/** "10" / "10.5" / "10.00" → "10.00", or null when it is not money. */
function normaliseAmount(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
}

/**
 * Read the envelope the caller says this order was approved inside.
 *
 * Returned as a plain error string so a refusal names the field rather than
 * echoing the payload back.
 *
 * The envelope still travels from the browser — the row lives in the browser
 * until persistence lands, which the session notes track separately — so what
 * this buys is not tamper-proofing. It is that the server judges the envelope
 * it is given instead of trusting the two numbers sitting in front of it:
 * without it, `amount` and `payeeEmail` were simply believed.
 */
function readEnvelope(value: unknown): { error: string } | PolicyEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "policy is required: an order is opened against an envelope." };
  }
  const p = value as Record<string, unknown>;

  if (typeof p.limit !== "number" || !Number.isFinite(p.limit) || p.limit <= 0) {
    return { error: "policy.limit must be a positive number." };
  }
  if (p.currency !== "USD" && p.currency !== "PYUSD") {
    return { error: "policy.currency must be USD or PYUSD." };
  }
  if (typeof p.what !== "string" || !p.what.trim() || p.what.length > MAX_TEXT) {
    return { error: `policy.what must be a non-empty string under ${MAX_TEXT} characters.` };
  }
  if (!isStatus(p.status)) return { error: "policy.status is not a known status." };

  // The three optional strings. Each is refused on the wrong type rather than
  // dropped — dropping the window or the recipient would switch a rule off by
  // sending the wrong value.
  for (const field of ["allowEndpoint", "payee", "expires"] as const) {
    const raw = p[field];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      return { error: `policy.${field} must be a string.` };
    }
    if (typeof raw === "string" && raw.length > MAX_TEXT) {
      return { error: `policy.${field} must be a string under ${MAX_TEXT} characters.` };
    }
  }

  const mode = p.mode;
  if (mode !== undefined && mode !== null && typeof mode !== "string") {
    return { error: "policy.mode must be a string." };
  }
  if (typeof mode === "string" && mode !== "" && !isMode(mode)) {
    return { error: "policy.mode must be Autonomous or Copilot." };
  }

  return {
    limit: p.limit,
    currency: p.currency,
    allowEndpoint: typeof p.allowEndpoint === "string" ? p.allowEndpoint : "",
    payee: typeof p.payee === "string" ? p.payee : "",
    what: p.what,
    status: p.status,
    expires: typeof p.expires === "string" ? p.expires : "",
    mode: typeof mode === "string" ? mode : "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const { action } = body as { action?: unknown };

    if (!canTalkToPaypal()) {
      return NextResponse.json(
        {
          success: false,
          error: "PayPal credentials are not configured, so no order can be created.",
        },
        { status: 503 }
      );
    }

    // ── create ────────────────────────────────────────────────────────────
    if (action === "create") {
      const { amount, currency, description, customId, payeeEmail } = body as Record<string, unknown>;

      const money = normaliseAmount(amount);
      if (!money) {
        return NextResponse.json(
          { success: false, error: "amount must be a positive number with at most two decimals." },
          { status: 400 }
        );
      }
      if (currency !== "USD" && currency !== "PYUSD") {
        return NextResponse.json(
          { success: false, error: "currency must be USD or PYUSD." },
          { status: 400 }
        );
      }
      const what = typeof description === "string" ? description.trim() : "";
      if (!what || what.length > 200) {
        return NextResponse.json(
          { success: false, error: `description must be 1-200 characters.` },
          { status: 400 }
        );
      }
      const payee = readPayee(payeeEmail);
      if ("error" in payee) {
        return NextResponse.json({ success: false, error: payee.error }, { status: 400 });
      }

      // The envelope, and the server's judgement of it — before the order
      // exists, because a reservation PayPal has already been asked for is
      // the wrong moment to find out it was outside the rules.
      //
      // Two rules do the work here that nothing else in this route could: the
      // ceiling (`amount` against what the operator approved) and the
      // recipient (`payeeEmail` against who the order may pay). Both were
      // previously taken on trust from the browser.
      //
      // `initiatedBy: "human"` is not a claim the browser gets to make for
      // itself — this route is reached from the approval card and the
      // transfer panel, both of which are buttons a person presses. The path
      // the agent walks is /api/policy/check, where it has to declare itself.
      const envelope = readEnvelope((body as Record<string, unknown>).policy);
      if ("error" in envelope) {
        return NextResponse.json({ success: false, error: envelope.error }, { status: 400 });
      }

      const verdict = judgeHoldRequest(
        {
          amount: Number(money),
          currency: currency as string,
          // An order names a recipient, not a host. The endpoint rule belongs
          // to the charge path, where a host is actually being reached; here
          // it would only ever compare a field with itself.
          endpoint: "",
          payee: payee.payeeEmail,
          initiatedBy: "human",
        },
        envelope
      );

      if (!verdict.allowed) {
        return NextResponse.json(
          { success: false, error: verdict.reason, violations: verdict.violations },
          { status: 409 }
        );
      }

      // The campaign this order funds, when it names one — `cf-<project id>`
      // is how a pledge says so, and it is the same field the panel already
      // writes, so the order cannot describe two different pledges.
      //
      // What the pledge is judged against comes from **this server's copy of
      // the catalogue**: the band and the goal are the campaign's figures, and
      // a request that supplied its own would be measuring itself. Refused
      // before PayPal is asked to create anything, because an order refused
      // after it exists leaves a record of an attempt the rules never allowed.
      const campaignId = campaignIdFromCustomId(customId);
      if (campaignId !== null) {
        const project = findCampaign(campaignId);
        if (!project) {
          // The id is not echoed back: reflecting a request's own payload into
          // an error message is how reflected-injection bugs are born, and the
          // sentence says what matters — no such campaign.
          return NextResponse.json(
            { success: false, error: "This order names a campaign the showcase does not hold." },
            { status: 409 }
          );
        }

        const investment = judgeInvestment(Number(money), project);
        if (!investment.allowed) {
          return NextResponse.json(
            { success: false, error: investment.reason, violations: investment.violations },
            { status: 409 }
          );
        }
      }

      try {
        const order = await createAuthorizeOrder({
          amount: money,
          currency,
          description: what,
          customId: typeof customId === "string" ? customId : undefined,
          payeeEmail: payee.payeeEmail || undefined,
        });
        return NextResponse.json({ success: true, mode: "live", ...order });
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : "PayPal refused to create the order.",
          },
          { status: 502 }
        );
      }
    }

    // ── authorize ─────────────────────────────────────────────────────────
    if (action === "authorize") {
      const { orderId } = body as Record<string, unknown>;
      if (typeof orderId !== "string" || !ORDER_ID.test(orderId.trim())) {
        return NextResponse.json(
          { success: false, error: "orderId is not a PayPal order id." },
          { status: 400 }
        );
      }

      try {
        const authorization = await authorizeApprovedOrder(orderId.trim());
        return NextResponse.json({ success: true, mode: "live", ...authorization });
      } catch (error) {
        // An unapproved order answers here rather than at capture time, where
        // the reason would be three steps away from what caused it.
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : "PayPal refused to authorize the order.",
          },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: "action must be create or authorize." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[/api/paypal/orders] Unhandled error:", error);
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal error."
        : error instanceof Error
          ? error.message
          : "Unknown error.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
