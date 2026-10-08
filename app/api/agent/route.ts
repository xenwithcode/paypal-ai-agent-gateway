// app/api/agent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBalance } from "@/lib/paypal";
import { parseUserIntention } from "@/lib/gemini";
import { STATUS } from "@/lib/policy";
// The meter in front of this route. It guards two spends, not one: the model
// call below and the PayPal balance read that precedes it.
import { agentRateLimit, keyFromHeaders } from "@/lib/rateLimit";
import { searchCandidates, evaluateCondition, candidateRecords, CATALOG_SOURCE } from "@/lib/commerce/catalog";
// Isolated module that owns the Venezuela inflation-shield logic.
import { processEmergencyDevaluationShield } from "@/lib/shields/InflationShield";

/** Hard cap on the intent text. Mirrors the `maxLength` on the input field. */
const MAX_PROMPT_LENGTH = 500;

/** "LATAM Airlines" → "latam-airlines" */
function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "unnamed";
}

/** "LATAM Airlines" → "latamairlines" */
function hostify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "") || "agent";
}

/** Intents that should be routed to the FX shield instead of the LLM. */
const INFLATION_KEYWORDS = [
  "bolívar", "bolivar",
  "devaluación", "devaluacion",
  "inflación", "inflacion",
  "proteger", "protect",
  "escudo cambiario", "fx shield",
  "inflation", "devaluation",
];

export async function POST(req: NextRequest) {
  // The only route that spends a model call, so the only one that needs a
  // meter. Checked before the body is even read: refusing cheaply is the
  // point, and parsing a payload we are about to throw away is work this
  // endpoint should not be paid for either.
  const limit = agentRateLimit.check(keyFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many requests — wait ${limit.retryAfterSeconds} second${
          limit.retryAfterSeconds === 1 ? "" : "s"
        } and try again.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body = await req.json().catch(() => null);

    // Reject malformed JSON and non-object payloads outright.
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const { prompt, location } = body as { prompt?: unknown; location?: unknown };

    // Strict input validation: the prompt drives an LLM call, so we never let
    // a non-string, empty or oversized value reach the model.
    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ success: false, error: "Intent required." }, { status: 400 });
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Intent exceeds ${MAX_PROMPT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const normalisedPrompt = prompt.toLowerCase();
    const userLocation = typeof location === "string" && location ? location : "VE";

    // Special case: only when the intent explicitly talks about protecting
    // against devaluation do we hand off to the isolated FX-shield module.
    //
    // NOTE: this condition used to include `location === "VE"` while `location`
    // itself defaulted to "VE", which meant EVERY request landed here and the
    // normal Gemini flow (parseUserIntention) was unreachable dead code.
    const wantsInflationShield = INFLATION_KEYWORDS.some((keyword) =>
      normalisedPrompt.includes(keyword)
    );

    if (wantsInflationShield) {
      const shieldResult = await processEmergencyDevaluationShield({
        userLocation: userLocation === "VE" ? "Venezuela" : userLocation,
        localCurrency: "VES",
        incomingAmountVES: 45000, // Simulated incoming payroll amount
      });
      return NextResponse.json(shieldResult);
    }

    // Normal flow: international purchases, trips, subscriptions, etc.
    // The number only — but obtained through getBalance(), so taking it
    // means acknowledging where it came from rather than it being unmarked.
    const availableBalance = (await getBalance()).value;
    const { policy, source, reason } = await parseUserIntention(prompt, availableBalance);

    // Resolve the policy against a catalog entry. Without this a price
    // condition could only be stored, never judged — and an unjudged condition
    // must not read as satisfied.
    //
    // One search rather than two: `candidates[0]` is exactly what
    // `matchProduct` would have picked, so asking for the list answers both
    // questions and the strip and the card can never disagree about the
    // winner.
    const query = `${policy.what} ${policy.merchant}`.trim();
    const { candidates, matchedBy } = await searchCandidates(query);
    const product = candidates[0] ?? null;
    const evaluation = evaluateCondition(policy.condition, product);

    // Computed once: the network scope shown to the approver and the one sent
    // to the sandbox config must never be two different strings.
    const allowEndpoint = policy.merchant ? `api.${hostify(policy.merchant)}.com` : "";

    return NextResponse.json({
      success: true,
      // Which path produced this policy: the model, or the deterministic
      // fallback. The console reports it verbatim rather than assuming.
      source,
      // And why, when it was the fallback — the console has no way to see the
      // server's configuration, so it must not describe it from here.
      reason,
      gridRow: {
        id: Date.now(),
        // Recorded here so the purchase history can date an order that was
        // later captured; a row stored before this existed simply has no
        // value rather than a wrong one.
        createdAt: new Date().toISOString(),
        what: policy.what,
        merchant: policy.merchant,
        limit: policy.limit,
        currency: policy.currency,
        condition: policy.condition,
        // Empty means no expiry. Printing "None" here used to read like a
        // value rather than an absence.
        expires: policy.expires || "",
        mode: policy.mode,
        status: STATUS.pending,
        marketPrice: product ? Number(product.price.toFixed(2)) : null,
        marketImage: product?.thumbnail ?? null,
        conditionMet: evaluation.met,
        conditionDetail: product
          ? `${evaluation.detail} · ${matchedBy} on ${CATALOG_SOURCE.name} (${CATALOG_SOURCE.kind})`
          : evaluation.detail,
        allowEndpoint,
        // The alternatives this order was drafted from, and which one the
        // agent proposed. `chosenId` is null because nobody has chosen yet —
        // the strip below is about to ask, and it writes the id that decided
        // it when somebody does. Keeping all three on the row is what makes
        // "the agent proposed X, you took Y, from Z options" a record rather
        // than a console line that scrolls away.
        candidates: candidateRecords(candidates),
        matchedId: product?.id ?? null,
        chosenId: null,
      },
      // What else the search found. The agent used to keep its ranking to
      // itself — the operator saw the product it preferred and never the ones
      // it passed over, so the choice was invisible exactly where a human is
      // meant to make it.
      candidates,
      /** Which candidate the agent would have taken, so the strip can mark it. */
      matchedId: product?.id ?? null,
      openShellConfig: {
        sandboxName: `sb-${slugify(policy.merchant || policy.what)}`,
        networkPolicy: {
          // Endpoint is derived from a named merchant only. Inferring a host
          // from "white sneakers, size 10" would produce nonsense.
          allowEndpoint,
          maxTransactionLimit: policy.limit,
          tokenTarget: "PYUSD_SOLANA_MAINNET",
        },
      },
    });
  } catch (error) {
    // Never leak internals to the client. Full detail goes to the server log
    // only; the browser receives a generic message.
    console.error("[/api/agent] Unhandled error:", error);
    const message =
      process.env.NODE_ENV === "production"
        ? "Internal error."
        : error instanceof Error
          ? error.message
          : "Unknown error.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
