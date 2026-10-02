// lib/gemini.ts
// Turns free-form user text into a structured spend policy for AG Grid.
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
    commerce: {
      type: Type.STRING,
      description: "Name of the identified merchant or airline",
    },
    limit: {
      type: Type.NUMBER,
      description: "Maximum amount of money authorized",
    },
    currency: {
      type: Type.STRING,
      description: "Transaction currency, defaults to PYUSD",
    },
    mode: {
      type: Type.STRING,
      description: "'Autonomous' or 'Copilot' depending on the size of the spend",
    },
    expires: {
      type: Type.STRING,
      description: "Estimated expiry window for this directive",
    },
  },
  required: ["commerce", "limit", "currency", "mode"],
};

export type IntentionPolicy = {
  commerce: string;
  limit: number;
  currency: string;
  mode: string;
  expires?: string;
};

export async function parseUserIntention(
  prompt: string,
  availableBalance: string
): Promise<IntentionPolicy> {
  // The system prompt is deliberately in English: it keeps the model's output
  // vocabulary aligned with the English UI and the AG Grid select editor.
  const systemInstruction =
    `You are the financial intent validator for PayPal AI Agent Gateway. ` +
    `You translate plain text into strict spend rules. The user's available ` +
    `balance is ${availableBalance} PYUSD. If the requested limit exceeds the ` +
    `balance, silently reduce it to the available balance. Respond only with ` +
    `JSON matching the provided schema. Use currency "PYUSD".`;

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

/** Enforces the balance cap and the exact types the UI expects. */
function normalise(policy: unknown, availableBalance: string): IntentionPolicy {
  const source: Record<string, unknown> =
    typeof policy === "object" && policy !== null ? (policy as Record<string, unknown>) : {};

  const maxBalance = parseBalance(availableBalance);
  const requested = Number(source.limit);
  const limit = Number.isFinite(requested) ? requested : 0;

  return {
    commerce:
      source.commerce !== undefined && String(source.commerce).trim()
        ? String(source.commerce)
        : "Unnamed merchant",
    limit: maxBalance > 0 ? Math.min(limit, maxBalance) : limit,
    currency: source.currency !== undefined ? String(source.currency) : "PYUSD",
    // Must match MODE exactly, or the AG Grid select editor shows an empty cell.
    mode: isMode(source.mode) ? source.mode : MODE.copilot,
    expires: source.expires !== undefined ? String(source.expires) : "End of month",
  };
}

const KNOWN_COMMERCE = [
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

/**
 * Deterministic fallback used when there is no real API key. It never pretends
 * to have consulted the model — it announces itself in the server log.
 */
function buildDemoPolicy(prompt: string, availableBalance: string): IntentionPolicy {
  const maxBalance = parseBalance(availableBalance);
  const lower = prompt.toLowerCase();

  const commerce =
    KNOWN_COMMERCE.find((c) => lower.includes(c.split(" ")[0].toLowerCase())) ??
    extractCapitalised(prompt) ??
    "Delegated merchant";

  // First number in the text is treated as the limit (e.g. "900 PYUSD").
  const amountMatch = prompt.replace(/\./g, "").match(/(\d[\d,]*)\s*(?:pyusd|usd)?/i);
  const requested = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 0;

  const limit = requested > 0 ? requested : Math.round(maxBalance * 0.25) || 100;
  const capped = maxBalance > 0 ? Math.min(limit, maxBalance) : limit;

  return {
    commerce,
    limit: capped,
    currency: "PYUSD",
    mode: capped >= 500 ? MODE.copilot : MODE.autonomous,
    expires: "End of month",
  };
}

/** Last-resort merchant guess from the first capitalised phrase in the prompt. */
function extractCapitalised(prompt: string): string | null {
  const match = prompt.match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})?)\b/);
  if (!match) return null;
  const ignored = new Set([
    "Quiero", "I", "Want", "To", "For", "With", "The", "A", "An",
    "My", "This", "Next", "Month", "Pay", "Max", "Maximum",
  ]);
  return ignored.has(match[1]) ? null : match[1];
}
