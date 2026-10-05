// lib/gemini.ts
// Turns free-form user text into a structured spend policy — the purchase
// order the human will approve.
//
// The schema is deliberately the same shape as the AG Grid columns. If the
// model can express it and the table can show it, an approver can judge it;
// fields nobody can inspect do not belong in something a human signs off on.
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { MODE, isMode } from "./policy";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

/** Serves every model this app uses; only the region of the request. */
const DEFAULT_LOCATION = "us-central1";

/**
 * How this server authenticates, decided by what is in .env.local.
 *
 * Two routes, and which one is taken matters: on Vertex the call is billed to
 * the GCP project — the account holding the hackathon credits — while an API
 * key bills to a Gemini API account of its own.
 *
 * - `vertex` → `GCP_PROJECT` is set. Auth comes from Application Default
 *   Credentials (the file `gcloud auth application-default login` wrote, or
 *   the service account GOOGLE_APPLICATION_CREDENTIALS points at), so no
 *   secret is copied into .env.local at all.
 * - `key` → `GEMINI_API_KEY` is set and is not still the env.example
 *   placeholder.
 */
type Auth = { kind: "vertex"; project: string } | { kind: "key"; apiKey: string };

function configuredAuth(): Auth | null {
  const project = process.env.GCP_PROJECT?.trim();
  if (project) return { kind: "vertex", project };

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  // Empty, or still the README placeholder from env.example.
  if (apiKey && !/^Tu[_-]/i.test(apiKey)) return { kind: "key", apiKey };

  return null;
}

// Lazily constructed client: if no credentials are configured the module can
// still be imported without crashing at server startup.
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  const auth = configuredAuth();
  if (!auth) return null;
  if (!client) {
    client =
      auth.kind === "vertex"
        ? new GoogleGenAI({
            vertexai: true,
            project: auth.project,
            location: process.env.GCP_LOCATION?.trim() || DEFAULT_LOCATION,
          })
        : new GoogleGenAI({ apiKey: auth.apiKey });
  }
  return client;
}

/** Strict JSON schema Gemini must return (Structured Outputs). */
const intentionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    what: {
      type: Type.STRING,
      description:
        "What to buy, with the attributes that identify it. e.g. 'white sneakers, size 10' or 'flight to Rio with LATAM'",
    },
    merchant: {
      type: Type.STRING,
      description:
        "Named merchant or brand if the user gave one, otherwise an empty string. Used to decide which endpoint may be contacted.",
    },
    limit: {
      type: Type.NUMBER,
      description: "The ceiling — the most that may be spent. Never a guess at the price.",
    },
    currency: {
      type: Type.STRING,
      description: "ISO 4217 currency of the ceiling, e.g. USD or PYUSD.",
    },
    condition: {
      type: Type.STRING,
      description:
        "What must be true before any money moves, e.g. 'price <= 60'. Empty string when the purchase should execute immediately without waiting.",
    },
    expires: {
      type: Type.STRING,
      description: "ISO date (YYYY-MM-DD) after which this authority lapses. Empty if none.",
    },
    mode: {
      type: Type.STRING,
      description: "'Autonomous' for small routine spends, 'Copilot' when a human must confirm.",
    },
  },
  required: ["what", "limit", "currency", "mode"],
};

export type IntentionPolicy = {
  what: string;
  merchant: string;
  limit: number;
  currency: string;
  condition: string;
  expires?: string;
  mode: string;
};

/**
 * Where a policy came from.
 *
 * Surfaced all the way to the UI because the console used to announce
 * "Gemini analyzing" while no model call had happened at all. Saying which
 * path ran is the difference between a log and a claim.
 */
export type IntentionResult = {
  policy: IntentionPolicy;
  source: "model" | "fallback";
  /**
   * Why no model produced this policy. Empty when one did.
   *
   * The console used to print "No GEMINI_API_KEY" for every `fallback`, but
   * `fallback` also covers a call that went out and came back failed — and
   * with Vertex it will no longer be about a key at all. The UI cannot see
   * the configuration, so guessing at it there is the same lie the console
   * and the approval card were each caught telling; the reason travels with
   * the verdict instead.
   */
  reason?: string;
};

export async function parseUserIntention(
  prompt: string,
  availableBalance: string
): Promise<IntentionResult> {
  // The system prompt is in English so the model's vocabulary lines up with
  // the column headers it has to satisfy.
  const systemInstruction =
    `You are the purchase-order author for PayPal AI Agent Gateway. ` +
    `Turn the user's request into a strict spending policy. The user's ` +
    `available balance is ${availableBalance}. If the requested ceiling ` +
    `exceeds it, reduce the ceiling to the available balance. Respond only ` +
    `with JSON matching the provided schema.\n` +
    `Rules:\n` +
    `- "condition" is what must hold before money moves. Leave it empty when ` +
    `the user wants it to happen right away.\n` +
    `- "expires" is a YYYY-MM-DD date, never a phrase.\n` +
    `- Keep "what" human readable; fold the identifying attributes into it ` +
    `rather than inventing extra fields.`;

  const ai = getClient();

  if (!ai) {
    warnDemo("no credentials configured");
    return {
      policy: buildDemoPolicy(prompt, availableBalance),
      source: "fallback",
      reason:
        "No credentials configured — set GCP_PROJECT for Vertex AI, or GEMINI_API_KEY for the Gemini API, in .env.local.",
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: intentionSchema,
      },
    });

    const raw = response.text;
    if (!raw) throw new Error("Gemini returned an empty response");

    return { policy: normalise(JSON.parse(raw), availableBalance), source: "model" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnDemo(`model call failed (${message})`);
    // The model did not produce this policy, so it must not be reported as
    // though it did — even though the shape coming back is identical. The
    // message is passed on rather than swallowed: the operator's only other
    // view of a failed call is the server console, and "nothing happened" is
    // the least useful thing this row could say.
    return {
      policy: buildDemoPolicy(prompt, availableBalance),
      source: "fallback",
      reason: `The model call failed: ${message}`,
    };
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

let warned = false;

function warnDemo(reason: string) {
  if (warned) return;
  warned = true;
  console.warn(
    `\n⚠️  [Gemini] parseUserIntention() is running in DEMO MODE: ${reason}.\n` +
      `    A deterministic policy will be produced instead of calling the model.\n` +
      `    Set GCP_PROJECT in .env.local for Vertex AI (auth via ADC), or\n` +
      `    GEMINI_API_KEY for the Gemini API — see env.example.\n`
  );
}

/** "2,480.00" → 2480. */
function parseBalance(value: string): number {
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value).trim();
  return text;
}

/** ISO date or empty — never let a phrase reach a date field. */
function asIsoDate(value: unknown): string {
  const text = asString(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

/** Enforces the balance cap and the exact types the UI expects. */
function normalise(policy: unknown, availableBalance: string): IntentionPolicy {
  const source: Record<string, unknown> =
    typeof policy === "object" && policy !== null ? (policy as Record<string, unknown>) : {};

  const maxBalance = parseBalance(availableBalance);
  const requested = Number(source.limit);
  const limit = Number.isFinite(requested) ? requested : 0;

  return {
    what: asString(source.what) || "Unnamed purchase",
    merchant: asString(source.merchant),
    limit: maxBalance > 0 ? Math.min(limit, maxBalance) : limit,
    currency: asString(source.currency) || "USD",
    condition: asString(source.condition),
    expires: asIsoDate(source.expires),
    // Must match MODE exactly, or the AG Grid select editor shows an empty cell.
    mode: isMode(source.mode) ? source.mode : MODE.copilot,
  };
}

/**
 * Merchant names used by the deterministic fallback.
 *
 * These are company names, not product names: `hostify` turns each one into
 * the allow-listed host (`Spotify` → api.spotify.com), so "Spotify Premium"
 * would have produced a domain that does not exist and "LATAM Airlines" one
 * LATAM has retired. Every entry here is checked for what it turns into.
 */
const KNOWN_MERCHANTS = [
  "LATAM",
  "Spotify",
  "Netflix",
  "Amazon",
  "Airbnb",
  "Uber",
  "Mercado Libre",
  "Rappi",
  "Falabella",
];

/** "1,200.50" → 1200.5. Dots are decimals here, never thousands separators. */
function parseAmount(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Find the ceiling in free text. Naively taking the first number picks up
 * "size 10" and turns a shoe size into a budget, so the order matters:
 * currency-adjacent beats keyword-adjacent beats the first untouched number.
 */
function extractCeiling(prompt: string): number {
  // 1. Written next to a currency: "60 USD", "900 PYUSD", "1,200 VES".
  const byCurrency = prompt.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(?:pyusd|usd|ves|dollars?|bol[ií]vares?)\b/i
  );
  if (byCurrency) {
    const n = parseAmount(byCurrency[1]);
    if (n > 0) return n;
  }

  // 2. Next to a spending keyword: "price ... 60", "at most ... 900".
  const byKeyword = prompt.match(
    /\b(?:price|cost|max|budget|at most|up to|spend|limit|ceiling)\b[^0-9]{0,16}(\d[\d,]*(?:\.\d+)?)/i
  );
  if (byKeyword) {
    const n = parseAmount(byKeyword[1]);
    if (n > 0) return n;
  }

  // 3. First number that is not a size or quantity.
  for (const match of prompt.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\b/g)) {
    const index = match.index ?? 0;
    const preceding = prompt.slice(Math.max(0, index - 12), index);
    if (/\b(size|qty|quantity|talla)\b/i.test(preceding)) continue;
    const n = parseAmount(match[1]);
    if (n > 0) return n;
  }

  return 0;
}

/**
 * Reduce an intent sentence to the thing being bought.
 *
 * The raw prompt carries the condition and deadline too, and using all of it
 * both uglyifies the grid cell and makes a catalogue search match nothing.
 * "white sneakers, only if the price drops to 60 USD" → "white sneakers".
 */
function subjectOf(prompt: string): string {
  const withDeadlineRemoved = prompt.replace(
    /\bby\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next\s+\w+|\d{4}-\d{2}-\d{2})\b/gi,
    " "
  );

  const cut = Math.min(
    ...[
      withDeadlineRemoved.search(
        /\b(?:only if|unless|if the|when the|at most|up to|no more than|no greater than|not more than|maximum budget|max budget|no m[áa]s de|no mayor que|m[áa]ximo)\b/i
      ),
      // "under 900" / "below 80" cut only when a number follows, so a phrase
      // like "under the table" is left alone.
      withDeadlineRemoved.search(/\b(?:under|below|menor que|menos de)\s*[$]?\s*\d/i),
    ].filter((index) => index > 0)
  );
  const head = Number.isFinite(cut) && cut > 0 ? withDeadlineRemoved.slice(0, cut) : withDeadlineRemoved;

  // Strip the ask itself. "I want to buy a pair of white sneakers, size 42,
  // for…" names a shopping request, not a product — and it is what the card
  // shows as the order's title and what the catalogue gets searched with.
  const withoutIntent = head
    .replace(
      /^(?:i\s+(?:want|need|would\s+like|'d\s+like)\s+(?:to\s+)?(?:buy|purchase|get|find|order|pick\s+up)|please\s+(?:buy|get|find|order)|(?:buy|purchase|order|get|find)(?:\s+me)?|quiero\s+(?:comprar|pedir|encontrar)|necesito\s+(?:comprar|compram?e)|compr(?:arme|ame)|b[uú]scame?|encu[eé]ntrame?)\b[\s,:-]*/i,
      ""
    )
    // Articles and quantifiers read as filler once the ask is gone: "a laptop"
    // and "a pair of white sneakers" search and display better without them.
    .replace(/^(?:a\s+(?:pair|set|couple)\s+of|an?|the)\s+/i, "");

  return (
    withoutIntent
      .replace(/\b\d[\d,.]*\s*(?:pyusd|usd|ves|dollars?)\b/gi, " ") // drop amounts
      .replace(/\s+/g, " ")
      // A cut mid-sentence leaves the preposition that introduced what was
      // cut: "…size 42, for no more than" becomes "…size 42, for".
      .replace(/\s+\b(?:for|to|at|with|of|de|para|por|a|e)\s*$/i, "")
      .replace(/[,;.]+\s*$/, "")
      .trim() || "Unnamed purchase"
  );
}

/**
 * Deterministic fallback used when there is no real API key. It never pretends
 * to have consulted the model — it announces itself in the server log.
 */
function buildDemoPolicy(prompt: string, availableBalance: string): IntentionPolicy {
  const maxBalance = parseBalance(availableBalance);
  const lower = prompt.toLowerCase();

  const merchant = KNOWN_MERCHANTS.find((m) => lower.includes(m.split(" ")[0].toLowerCase())) ?? "";

  const requested = extractCeiling(prompt);
  const limit = requested > 0 ? requested : Math.round(maxBalance * 0.25) || 100;
  const capped = maxBalance > 0 ? Math.min(limit, maxBalance) : limit;

  // A spending cap phrased as a limit is a condition, not noise: "no more
  // than $80" means buy only at or below 80, which is exactly what the
  // condition column has to say for the hold to be judged at all. Without
  // this the order read "spend now" while its ceiling said "exceeded".
  const conditional =
    /\b(only if|unless|no more than|no greater than|not more than|at most|up to|when)\b/i.test(prompt) ||
    /\b(si solo|solo si|cuando|no m[áa]s de|no mayor que|m[áa]ximo)\b/i.test(prompt) ||
    // "under 900" / "below 80" / "menor que 50" — a bound with a number after it.
    /\b(?:under|below|menor que|menos de)\s*[$]?\s*\d/i.test(prompt);

  return {
    what: subjectOf(prompt).slice(0, 90),
    merchant,
    limit: capped,
    currency: /pyusd/i.test(prompt) ? "PYUSD" : "USD",
    condition: conditional ? `price <= ${capped}` : "",
    expires: "",
    mode: capped >= 500 ? MODE.copilot : MODE.autonomous,
  };
}
