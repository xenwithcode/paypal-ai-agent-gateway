// app/api/agent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBalance } from "@/lib/paypal";
import { parseUserIntention, rankCandidates } from "@/lib/gemini";
import { STATUS } from "@/lib/policy";
// The meter in front of this route. It guards two spends, not one: the model
// call below and the PayPal balance read that precedes it.
import { agentRateLimit, keyFromHeaders } from "@/lib/rateLimit";
import { searchCandidates, evaluateCondition, candidateRecords, CATALOG_SOURCE } from "@/lib/commerce/catalog";
// What the relevance verdict means for the strip — pure, so the rule is
// tested without a model standing in for it.
import { applyRelevance } from "@/lib/commerce/relevance";
// The sentence the gateway asks for a ceiling with — in the language the
// request arrived in, because it is also the line the voice speaks aloud.
import { ceilingQuestion } from "@/lib/ceilingQuestion";
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

    // An order without a ceiling is not an order — it is a blank cheque,
    // and the one time this bit somebody, the parser filled the gap with
    // the account balance and the strip offered a $3,999 motorcycle for a
    // jacket. The gateway asks before it searches: no catalog read, no
    // ranking call, no money in motion on a number nobody said. The
    // `needsCeiling` flag tells the console this is a question rather than
    // a failure, and the voice path narrates it like any other line.
    // The question itself is asked in the language of the request: the
    // human who just wrote in Spanish is asked in Spanish, and the spoken
    // agent repeats this same sentence out loud.
    if (policy.limit <= 0) {
      return NextResponse.json({
        success: false,
        needsCeiling: true,
        error: ceilingQuestion(prompt),
      });
    }

    // Resolve the policy against a catalog entry. Without this a price
    // condition could only be stored, never judged — and an unjudged condition
    // must not read as satisfied.
    //
    // One search rather than two: `candidates[0]` is exactly what
    // `matchProduct` would have picked, so asking for the list answers both
    // questions and the strip and the card can never disagree about the
    // winner.
    // The catalog speaks English; the human may not. `searchQuery` is the
    // parser's English rendering of the same item — the record in `what`
    // keeps the human's own words, the search uses the words the catalog
    // answers to. Empty falls back to `what`, which is every English
    // request and every request the parser could not translate.
    const query = `${policy.searchQuery || policy.what} ${policy.merchant}`.trim();
    const { candidates, matchedBy } = await searchCandidates(query);
    // The search is literal; the question is not. Asking for a "motorcycle
    // riding jacket" in a catalog that holds motorcycles but no jackets
    // returned three motorcycles — confidently offered, none of them a
    // jacket. So the keyword hits are now judged against the intent before
    // they reach the strip: only products that genuinely ARE what was asked
    // for are offered, each with the judge's one-line reason. A judgement
    // that cannot run keeps the keyword order exactly as it was — the human
    // still chooses, the server still judges, and a missing opinion may
    // never empty the strip on its own.
    //
    // The second model call of this request. The meter counts the request,
    // not the calls: parsing the intent and ranking what the search found
    // are one decision in two halves, and both bill the same cheap model.
    const verdict = candidates.length > 0 ? await rankCandidates(policy.what, candidates) : null;
    const relevance = applyRelevance(candidates, verdict, policy.what);
    const product = relevance.kept[0] ?? null;
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
      // What else the search found, after the relevance judge has spoken:
      // only the candidates that ARE what was asked for, best first, each
      // carrying the one-line reason it was kept. The agent used to keep its
      // ranking to itself — the operator saw the product it preferred and
      // never the ones it passed over, so the choice was invisible exactly
      // where a human is meant to make it.
      candidates: relevance.kept,
      /**
       * The honest sentence when nothing matched — spoken and logged, so the
       * absence of a strip is explained rather than merely visible.
       */
      searchNote: relevance.note,
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
