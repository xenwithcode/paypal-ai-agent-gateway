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

// Lazily constructed client: if no API key is configured the module can still
// be imported without crashing at server startup.
let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  // Empty, or still the README placeholder from env.example.
  if (!apiKey || /^Tu[_-]/i.test(apiKey)) return null;
  if (!client) client = new GoogleGenAI({ apiKey });
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

export async function parseUserIntention(
  prompt: string,
  availableBalance: string
): Promise<IntentionPolicy> {
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
    warnDemo("GEMINI_API_KEY missing or still the env.example placeholder");
    return buildDemoPolicy(prompt, availableBalance);
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

    return normalise(JSON.parse(raw), availableBalance);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnDemo(`Gemini call failed (${message})`);
    return buildDemoPolicy(prompt, availableBalance);
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
      `    Set GEMINI_API_KEY in .env.local to enable real Gemini inference.\n`
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

const KNOWN_MERCHANTS = [
  "LATAM Airlines",
  "Spotify Premium",
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

  const cut = withDeadlineRemoved.search(
    /\b(?:only if|unless|if the|when the|at most|up to|no more than|maximum budget|max budget)\b/i
  );
  const head = cut > 0 ? withDeadlineRemoved.slice(0, cut) : withDeadlineRemoved;

  return (
    head
      .replace(/\b\d[\d,.]*\s*(?:pyusd|usd|ves|dollars?)\b/gi, " ") // drop amounts
      .replace(/\s+/g, " ")
      .replace(/[,;:.\s]+$/, "")
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

  // Anything phrased as "only if" / "unless" is a condition, not noise.
  const conditional = /\b(only if|unless|si solo|solo si|cuando|when)\b/i.test(prompt);

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
