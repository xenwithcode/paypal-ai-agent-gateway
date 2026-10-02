// app/api/agent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getPYUSDBalance } from "@/lib/paypal";
import { parseUserIntention } from "@/lib/gemini";
import { STATUS } from "@/lib/policy";
// Isolated module that owns the Venezuela inflation-shield logic.
import { processEmergencyDevaluationShield } from "@/lib/shields/InflationShield";

/** Hard cap on the intent text. Mirrors the `maxLength` on the input field. */
const MAX_PROMPT_LENGTH = 500;

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
    const availableBalance = await getPYUSDBalance();
    const policy = await parseUserIntention(prompt, availableBalance);

    return NextResponse.json({
      success: true,
      gridRow: {
        id: Date.now(),
        commerce: policy.commerce,
        limit: policy.limit,
        currency: policy.currency,
        mode: policy.mode,
        expires: policy.expires ?? "End of month",
        status: STATUS.pending,
      },
      openShellConfig: {
        sandboxName: `sb-${policy.commerce.toLowerCase().replace(/\s+/g, "-")}`,
        networkPolicy: {
          allowEndpoint: `api.${policy.commerce.toLowerCase().replace(/\s+/g, "")}.com`,
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
