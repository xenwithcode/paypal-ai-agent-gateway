// app/api/manifest/route.ts
//
// Orders as a counterparty reads them, and the check that goes with them.
//
// A manifest is only worth publishing if something other than this browser can
// fetch it — that is the whole difference between a page a person opens and a
// record a machine acts on. So `GET` reads the durable copy, and `POST` answers
// the question the other side of a trade actually asks: *does this payment fit
// these terms?*
//
// The offer is judged by `judgeOffer`, which asks `judgeCharge` about
// everything except the amount and states the floor itself. The same `Verdict`
// comes back either way, so a caller cannot tell which side it asked about —
// which is the point: a buyer checking a charge and a seller checking an offer
// are one question in two seats.
//
// The terms travel *in the request* rather than being looked up by id. A
// counterparty that fetched the manifest already holds it, and making it send
// back what it read means this endpoint never has to answer "which manifest do
// you mean" — or worse, answer it differently than the document it served.

import { NextRequest, NextResponse } from "next/server";
import { looksLikeManifest, manifestFor, type Manifest } from "@/lib/manifests";
import { judgeOffer, type Offer, type OfferTerms } from "@/lib/policy";
import { readStoreFile } from "@/lib/storeFile";

/** Mirrors the maxLength the grid's editable cells carry. */
const MAX_TEXT = 200;

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function readText(value: unknown, field: string, required = false): string | { error: string } {
  if (value === undefined || value === null || value === "") {
    if (required) return { error: `${field} is required.` };
    return "";
  }
  if (typeof value !== "string") return { error: `${field} must be a string.` };
  if (value.length > MAX_TEXT) return { error: `${field} must be under ${MAX_TEXT} characters.` };
  return value;
}

/** A fetched manifest, in the shape the terms are judged in. */
function readTerms(value: unknown): { error: string } | OfferTerms {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "manifest must be an object — send the one you fetched." };
  }
  const raw = value as Record<string, unknown>;

  const ceiling = raw.ceiling as Record<string, unknown> | undefined;
  if (!ceiling || typeof ceiling !== "object" || !isMoney(ceiling.amount)) {
    return { error: "manifest.ceiling.amount must be a positive number." };
  }
  if (typeof ceiling.currency !== "string" || !ceiling.currency.trim()) {
    return { error: "manifest.ceiling.currency must be a currency." };
  }

  const what = readText(raw.what, "manifest.what", true);
  if (typeof what === "object") return what;
  const status = readText(raw.status, "manifest.status", true);
  if (typeof status === "object") return status;

  const buyer = readText(raw.payee, "manifest.payee");
  if (typeof buyer === "object") return buyer;
  const allowEndpoint = readText(raw.allow_endpoint, "manifest.allow_endpoint");
  if (typeof allowEndpoint === "object") return allowEndpoint;
  const expires = readText(raw.valid_until, "manifest.valid_until");
  if (typeof expires === "object") return expires;
  const mode = readText(raw.mode, "manifest.mode");
  if (typeof mode === "object") return mode;

  return {
    what,
    price: ceiling.amount,
    currency: ceiling.currency,
    buyer,
    allowEndpoint,
    status,
    expires,
    mode,
  };
}

/** The payment being offered. */
function readOffer(value: unknown): { error: string } | Offer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "offer must be an object." };
  }
  const raw = value as Record<string, unknown>;

  if (!isMoney(raw.amount)) return { error: "offer.amount must be a positive number." };
  if (typeof raw.currency !== "string" || !raw.currency.trim()) {
    return { error: "offer.currency must be a currency." };
  }

  const buyer = readText(raw.buyer, "offer.buyer");
  if (typeof buyer === "object") return buyer;
  const endpoint = readText(raw.endpoint, "offer.endpoint");
  if (typeof endpoint === "object") return endpoint;

  const initiatedBy = raw.initiatedBy;
  if (
    initiatedBy !== undefined &&
    initiatedBy !== null &&
    initiatedBy !== "human" &&
    initiatedBy !== "agent"
  ) {
    return { error: "offer.initiatedBy must be human or agent." };
  }

  return {
    amount: raw.amount,
    currency: raw.currency,
    buyer,
    endpoint,
    initiatedBy: initiatedBy === "human" || initiatedBy === "agent" ? initiatedBy : undefined,
  };
}

/** Every stored order the store will vouch for, as manifests. */
export async function GET() {
  const store = await readStoreFile();
  const manifests: Manifest[] = store.policies.filter(looksLikeManifest).map(manifestFor);

  return NextResponse.json(
    { manifests },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Does this payment fit these terms?
 *
 * Reads the terms from the body rather than looking them up, so the answer is
 * about the document the caller actually holds — and a manifest that changed
 * in between cannot be judged against a version that was never served.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const terms = readTerms((body as { manifest?: unknown }).manifest);
    if ("error" in terms) {
      return NextResponse.json({ success: false, error: terms.error }, { status: 400 });
    }

    const offer = readOffer((body as { offer?: unknown }).offer);
    if ("error" in offer) {
      return NextResponse.json({ success: false, error: offer.error }, { status: 400 });
    }

    const verdict = judgeOffer(offer, terms);

    return NextResponse.json({
      success: true,
      allowed: verdict.allowed,
      violations: verdict.violations,
      reason: verdict.reason,
      // The price the offer was judged against, so a refusal says which
      // document answered rather than only what it said.
      judged: {
        amount: offer.amount,
        currency: offer.currency,
        price: terms.price,
        what: terms.what,
      },
    });
  } catch (error) {
    console.error("[/api/manifest] Unhandled error:", error);
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal error."
        : error instanceof Error
          ? error.message
          : "Unknown error.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
