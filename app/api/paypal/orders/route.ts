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
import {
  authorizeApprovedOrder,
  canTalkToPaypal,
  createAuthorizeOrder,
} from "@/lib/paypal";

/** PayPal order ids are a short alphanumeric run; anything else is not one. */
const ORDER_ID = /^[A-Z0-9]{10,40}$/i;

/** "10" / "10.5" / "10.00" → "10.00", or null when it is not money. */
function normaliseAmount(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
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
      const { amount, currency, description, customId } = body as Record<string, unknown>;

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

      try {
        const order = await createAuthorizeOrder({
          amount: money,
          currency,
          description: what,
          customId: typeof customId === "string" ? customId : undefined,
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
