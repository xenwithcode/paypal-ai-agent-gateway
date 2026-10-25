// lib/gemini.ts
// Turns free-form user text into a structured spend policy — the purchase
// order the human will approve.
//
// The schema is deliberately the same shape as the AG Grid columns. If the
// model can express it and the table can show it, an approver can judge it;
// fields nobody can inspect do not belong in something a human signs off on.
import { GoogleGenAI, Type, type Schema } from "@google/genai";
// The extension is required rather than optional for the same reason
// `lib/catalog.ts` has one: tests load this module through Node's ESM
// resolver, which does not guess — see the note on `allowImportingTsExtensions`.
import { MODE, isMode, resolveExpiry } from "./policy.ts";
// Type-only: what the relevance judge answers, spelled by the module that
// decides what its answer means. Erased before bundling — this file is
// server-side, but the import keeps one vocabulary for "the verdict".
import type { RelevanceVerdict } from "./commerce/relevance.ts";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

/**
 * Where the request is served. Verified against a real project, not assumed:
 * `gemini-3.8-flash` — this app's default model — **404s in `us-central1`**
 * and only answers from `global`, while `gemini-2.5-flash` answers from all
 * three regions tried. Region and model are not independent choices, and
 * picking a location that does not serve the configured model looks exactly
 * like a model that does not exist.
 */
const DEFAULT_LOCATION = "global";

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

// Lazily constructed clients, keyed by location: if no credentials are
// configured the module can still be imported without crashing at server
// startup, and the Live API needs the *same* auth pointed at a *different*
// region (see `lib/voice/live.ts`), so one cache per location is what lets
// that module reuse this file's rules instead of writing a second copy of
// them that could drift.
const clients = new Map<string, GoogleGenAI>();

/**
 * A client for `location`, or null when nothing is configured.
 *
 * The auth decision — and only that decision — belongs here. `GCP_PROJECT`
 * wins over `GEMINI_API_KEY`, ADC supplies Vertex's credential, and the key
 * rides in a header the SDK sets itself.
 */
export function genaiClientFor(location: string): GoogleGenAI | null {
  const auth = configuredAuth();
  if (!auth) return null;

  const cacheKey = `${auth.kind}:${auth.kind === "vertex" ? auth.project : auth.apiKey}:${location}`;
  const cached = clients.get(cacheKey);
  if (cached) return cached;

  const created =
    auth.kind === "vertex"
      ? new GoogleGenAI({ vertexai: true, project: auth.project, location })
      : new GoogleGenAI({ apiKey: auth.apiKey });

  clients.set(cacheKey, created);
  return created;
}

function getClient(): GoogleGenAI | null {
  return genaiClientFor(process.env.GCP_LOCATION?.trim() || DEFAULT_LOCATION);
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
    searchQuery: {
      type: Type.STRING,
      description:
        "When the request is not in English, the same item in English, for the catalog search — " +
        "e.g. 'chaqueta para montar moto' → 'motorcycle riding jacket'. Empty string when the request is already in English.",
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
  /**
   * The same item, in English, for the catalog search.
   *
   * The human's words stay in `what` — that is the record of what they
   * asked for. But the demo catalog's titles are English, so a Spanish
   * request searched by its own words finds nothing ("chaqueta" matches no
   * product, and the honest no-match note is correct but avoidable). Empty
   * when the request is already in English; the route falls back to `what`.
   */
  searchQuery?: string;
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
    `Turn the user's request into a strict spending policy. ` +
    // The model has no idea what day it is, and being asked for a date
    // without one produced "2024-10-27" for a deadline of October 27 in
    // 2026 — an authority that had already lapsed the moment it was written.
    // A stale year is not a formatting slip; it makes the policy worthless.
    `Today is ${new Date().toISOString().slice(0, 10)}. Resolve every ` +
    `relative date ("by Friday", "next week", "the 27th") against that, and ` +
    `never return an "expires" date that has already passed. ` +
    `The user's available balance is ${availableBalance}. If the requested ` +
    `ceiling exceeds it, reduce the ceiling to the available balance. ` +
    // The human may speak or type in any language — Spanish is expected in
    // this product's own market, and the voice layer sometimes hands over a
    // Spanish prompt verbatim. Only the free-text fields follow their words:
    // the machine reads numbers and ISO dates, so "150 dólares" and "el
    // viernes" have to land exactly where "150 dollars" and "this Friday"
    // would. This is not decoration — a ceiling misread in translation is a
    // ceiling the server enforces wrong.
    `The request may arrive in any language — Spanish among them. Read ` +
    `amounts, ceilings and dates exactly as you would in English ("150 ` +
    `dólares" is 150 USD, "el viernes" is this coming Friday); keep "what" ` +
    `in the human's own words. When the request is not in English, also ` +
    `fill "searchQuery" with the same item in English — the catalog the ` +
    `gateway searches is English. ` +
    `Respond only with JSON matching the provided schema.\n` +
    `Rules:\n` +
    // The schema's example showed "price <= 60" but never said when to
    // produce one, so the model read "no more than $100" as a budget alone
    // and returned an empty condition — five times out of five. An empty
    // condition is not neutral here: lib/policy.ts turns it into a standing
    // allowance instead of a held order, and the approval card hides the
    // PayPal button behind conditionText, so the bounded purchase the user
    // asked for became an unconditional one with no way to approve it.
    `- "condition" is what must hold before money moves. When the request ` +
    `names a maximum price ("no more than 100", "at most $80", "below 50"), ` +
    `that maximum IS the condition: write it as 'price <= <N>'. Do not ` +
    `leave it empty just because the same number also sets the ceiling — ` +
    `"limit" is the budget and "condition" is what the approver verifies, ` +
    `and an empty condition turns a bounded purchase into an immediate ` +
    `unconditional one. Leave it empty only when the user asked for it to ` +
    `go ahead with no requirement attached.\n` +
    // An order without a ceiling is a blank cheque, and the one time this
    // bit somebody the parser filled the gap with the account balance —
    // which offered a $3,999 motorcycle as a match for a jacket. The
    // gateway asks the human instead: limit 0 means "no amount was stated",
    // and the route refuses the draft with a question before it searches
    // anything. Never invent the number that authorises the spend.
    `- "limit" must come from the request: the maximum price named, or the ` +
    `exact amount to send or invest. If the request names no amount at all, ` +
    `return 0 — the gateway will ask the human for it. Never use the ` +
    `available balance as a ceiling and never invent an amount.\n` +
    // "valid until the 27th" came back as tomorrow's date: the model read the
    // sentence and answered with a deadline of its own. Naming the shape the
    // rule wants — the *next* occurrence of that day — costs one line and it
    // is the difference between the cell saying the 27th and saying the 9th.
    `- "expires" is a YYYY-MM-DD date, never a phrase. A day of the month ` +
    `("the 27th", "el 27") is the NEXT upcoming occurrence of that day — ` +
    `never today's date, and never a weekday.\n` +
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

/** Strict schema for the relevance verdict (Structured Outputs, same as the parser's). */
const relevanceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    noneMatch: {
      type: Type.BOOLEAN,
      description: "true when NOT ONE of the candidates is what the user asked for.",
    },
    picks: {
      type: Type.ARRAY,
      description:
        "The candidates that genuinely ARE what the user asked for, best first. Empty when noneMatch is true.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.NUMBER, description: "The candidate's catalog id." },
          reason: {
            type: Type.STRING,
            description: "One short reason this product is what was asked for.",
          },
        },
        required: ["id", "reason"],
      },
    },
  },
  required: ["noneMatch", "picks"],
};

/**
 * Which of these products ARE what the user asked for — and why.
 *
 * The keyword search answers "which products mention these words"; this
 * answers "which of these products is the thing", and the two are not the
 * same question. The worked example is in this project's history: asking for
 * a "motorcycle riding jacket" in a catalog that holds motorcycles but no
 * jackets returned three motorcycles — confidently, with prices in the
 * thousands, none of them a jacket.
 *
 * Returns `null` when nothing can be judged — no credentials, a failed call,
 * a malformed answer — and the caller then keeps the keyword order exactly
 * as it was. A missing opinion must never empty the strip; see
 * `applyRelevance`, which owns that rule and is tested for it.
 */
export async function rankCandidates(
  intent: string,
  candidates: readonly {
    id: number;
    title: string;
    brand?: string;
    category: string;
    price: number;
  }[]
): Promise<RelevanceVerdict | null> {
  if (candidates.length === 0) return null;
  const ai = getClient();
  if (!ai) return null;

  // Only what the judge needs to see: identity and category. The prose
  // description of every product would triple the tokens for a question the
  // title, brand and category already answer.
  const shortlist = candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    brand: candidate.brand ?? "",
    category: candidate.category,
    price: candidate.price,
  }));

  const systemInstruction =
    `You are the relevance judge for PayPal AI Agent Gateway. ` +
    `The human asked for: "${intent}". ` +
    `Below are catalog candidates returned by a literal keyword search. ` +
    `Keep ONLY the candidates that genuinely ARE what the human asked for — the same kind of product. ` +
    `A motorcycle is not a jacket; a phone case is not a phone; sharing a brand does not make it a match. ` +
    `For each kept candidate give ONE short reason it matches. ` +
    `If not one of them is what was asked for, set noneMatch true and return no picks — ` +
    `never keep a candidate to be polite: the human is about to be asked to spend money on it. ` +
    `Respond only with JSON matching the provided schema.`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify({ intent, candidates: shortlist }),
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: relevanceSchema,
      },
    });

    const raw = response.text;
    if (!raw) return null;

    // Validated on the way out of the model, never trusted — the same rule
    // the parser follows. An id the catalog did not return is ignored by
    // `applyRelevance`, which is why it is allowed to arrive here.
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const data = parsed as { noneMatch?: unknown; picks?: unknown };
    const picks = Array.isArray(data.picks)
      ? data.picks
          .filter(
            (item): item is { id: unknown; reason: unknown } =>
              !!item && typeof item === "object" && !Array.isArray(item)
          )
          .map((item) => ({
            id: Number((item as { id: unknown }).id),
            reason: String((item as { reason: unknown }).reason ?? ""),
          }))
          .filter((pick) => Number.isFinite(pick.id))
      : [];
    return { noneMatch: data.noneMatch === true, picks };
  } catch {
    // A failed ranking must not cost the operator the candidates the catalog
    // did return — it costs only the ranking. The strip falls back to the
    // keyword order, which is exactly what it was before this call existed.
    return null;
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

/**
 * ISO date, or whatever arrived when it is not one.
 *
 * Deliberately not "ISO or empty": this field bounds an authority, and
 * `""` means *this order never expires*. Dropping an unreadable phrase here
 * used to turn a deadline nobody could read into a permission nobody could
 * revoke. `resolveExpiry` resolves the words people write and returns the
 * rest unchanged, so `readExpiry` can refuse the charge and say why.
 */
function asExpiry(value: unknown): string {
  return resolveExpiry(asString(value));
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
    expires: asExpiry(source.expires),
    // Must match MODE exactly, or the AG Grid select editor shows an empty cell.
    mode: isMode(source.mode) ? source.mode : MODE.copilot,
    // The English words for the catalog, when the request was not in English.
    // Empty is a value here, not a absence: the route reads `|| what`.
    searchQuery: asString(source.searchQuery),
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
 * A number sitting inside a date is a date, not a price.
 *
 * "hasta el 25 de octubre" names a deadline and the 25 belongs to it; read
 * as a ceiling it would draft — and authorise — an order the human never
 * priced. Weekdays count too, for the same reason: the number next to
 * "Friday" is the date, not the money.
 */
const DATE_WORDS =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|ma[nñ]ana)\b/i;

function insideDate(prompt: string, index: number): boolean {
  return (
    DATE_WORDS.test(prompt.slice(Math.max(0, index - 12), index)) ||
    DATE_WORDS.test(prompt.slice(index, index + 22))
  );
}

/**
 * Find the ceiling in free text — or return **0 when the request names none**.
 *
 * This is the whole rule the gateway's question rests on: `0` is not "no
 * number found, so invent one", it is "the human did not say what this may
 * cost, so go and ask them". `buildDemoPolicy` used to fill the gap with 25%
 * of the account balance, which meant that without credentials — the
 * deployed demo — *every* request arrived with a ceiling nobody had said and
 * the route's `limit <= 0` question never fired: the strip offered products
 * for a budget the human never gave.
 *
 * So only two shapes count as a stated amount:
 *
 * 1. **Currency-adjacent** — "60 USD", "$500", "500 dólares". Unambiguous in
 *    any language, so it is read even beside a weekday ("offers this Friday,
 *    60 USD" is still 60 USD).
 * 2. **Keyword-adjacent** — "under 900", "at most 80", "no más de 50". The
 *    keyword is what makes a bare number mean money, and even here a number
 *    inside a date is rejected.
 *
 * There is deliberately no third rule. "The first number in the sentence" is
 * how a shoe size becomes a budget (`size 10`), how a quantity becomes one
 * (`2 camisetas`) and how a deadline becomes one (`25 de octubre`) — three
 * drafts of a spend nobody authorised. When the sentence is ambiguous the
 * honest reading is the question, not a guess.
 */
export function extractCeiling(prompt: string): number {
  // 1. Written next to a currency. `$` on either side counts as currency,
  //    and `dólares` is spelled the way the product's own market spells it.
  const currencyShapes = [
    /(\d[\d,]*(?:\.\d+)?)\s*(?:pyusd|usd|ves|dollars?|d[oó]lares?|bol[ií]vares?|euros?)\b/gi,
    /\$\s*(\d[\d,]*(?:\.\d+)?)/g,
    /(\d[\d,]*(?:\.\d+)?)\s*\$/g,
  ];
  for (const shape of currencyShapes) {
    for (const match of prompt.matchAll(shape)) {
      const n = parseAmount(match[1]);
      if (n > 0) return n;
    }
  }

  // 2. Next to a spending keyword. The gap is short on purpose: a number
  //    sixteen characters away from "budget" is a different clause. Matches
  //    inside a date are skipped rather than ending the search — a deadline
  //    at the head of the sentence must not hide a real amount later in it.
  for (const match of prompt.matchAll(
    /\b(?:price|cost[s]?|budget|max|maximum|at most|up to|spend|spending|limit|ceiling|under|below|no more than|no greater than|not more than|precio|coste|cuesta|gastar?|gasto|presupuesto|l[ií]mite|techo|no m[áa]s de|no mayor que|menor que|menos de|m[áa]ximo|hasta)\b[^0-9]{0,16}(\d[\d,]*(?:\.\d+)?)/gi
  )) {
    const index = (match.index ?? 0) + match[0].lastIndexOf(match[1]);
    if (insideDate(prompt, index)) continue;
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

  // 0 means the request named no amount — never "no amount, so take a slice
  // of the balance". This used to be `Math.round(maxBalance * 0.25) || 100`,
  // and with it the whole ask-first rule went missing on the path that needs
  // it most: without credentials every draft arrived carrying a ceiling
  // nobody had said (25% of the demo balance), so `/api/agent`'s
  // `limit <= 0` guard never fired and the catalog was searched — and its
  // candidates offered — for a budget the human never gave. The number that
  // authorises a spend comes from the human or from nowhere.
  const limit = extractCeiling(prompt);
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
    // Only when there is a ceiling to be the condition of: `price <= 0` would
    // describe a spend nobody priced, and a draft that reached this line with
    // no amount is refused by the route before anyone can read it.
    condition: conditional && capped > 0 ? `price <= ${capped}` : "",
    // The fallback reads the deadline out of the sentence instead of out of a
    // model, so it gets the same treatment the model path gets: a phrase it
    // can read becomes a date, and a phrase it cannot stays as it was rather
    // than becoming "no expiry". It has no model to blame for a value, only
    // prose — so a deadline is only claimed when one is literally there.
    expires: resolveExpiry(deadlineOf(prompt)),
    mode: capped >= 500 ? MODE.copilot : MODE.autonomous,
  };
}

/**
 * The deadline a sentence carries, or "" when it carries none.
 *
 * Anchored on the words that turn a clause into a deadline: without one,
 * "buy this before the sale" and "buy this" are the same request, and the
 * second one must not be answered with a date.
 *
 * Exported because it is the one part of the fallback path that can invent
 * something: the capture decides what the window will be read against, so it
 * is pinned by a test rather than left to be discovered by a charge that was
 * refused — or, worse, by one that was not.
 */
export function deadlineOf(prompt: string): string {
  const match = prompt.match(
    /\b(?:by|until|till|before|expires?\s+(?:by|on|at)|hasta|antes\s+del(?:a)?)\s+([^,.;!?]{1,40})/i
  );
  return (match?.[1] ?? "").trim();
}

// ─── Spoken input ──────────────────────────────────────────────────────────

/**
 * What a spoken request filled in for the recurring form.
 *
 * Every field can be empty, and an empty string means one thing only: **the
 * user did not say it**. That is why nothing here is optional in the schema
 * and why nothing is defaulted — a model that invents an amount to complete a
 * form has written a number the operator will be asked to approve, and this
 * product does not put values in front of a human that nobody said out loud.
 *
 * Voice *suggests*; the form is still where it is confirmed, and the approval
 * card is still where it is agreed. Nothing here submits anything.
 */
export type SpokenService = {
  service: string;
  url: string;
  amount: string;
  currency: string;
  date: string;
};

export type SpokenResult = {
  /** The fields, or null when nothing could be understood. */
  fields: SpokenService | null;
  source: "model" | null;
  /** Plain reason when nothing came back. Never a stack trace. */
  reason: string | null;
};

const spokenSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    service: {
      type: Type.STRING,
      description: "The service as the user named it, e.g. 'Netflix'. Never invented.",
    },
    url: {
      type: Type.STRING,
      description: "The website for that service if the user gave one. Empty string if not said.",
    },
    amount: {
      type: Type.STRING,
      description: "Digits only, e.g. '15.99'. Empty string if the user did not say an amount.",
    },
    currency: {
      type: Type.STRING,
      description: "USD unless the user named PYUSD.",
    },
    date: {
      type: Type.STRING,
      description:
        "The next payment date as YYYY-MM-DD, resolving relative dates against today. Empty string if not said.",
    },
  },
  required: ["service", "url", "amount", "currency", "date"],
};

const SPOKEN_RULES = `You are filling in a form for a recurring payment from what was said aloud.

- service: the service the user named, as they named it. Required.
- url: the site for that service if they gave one, without a path. "" when not said.
- amount: digits only, e.g. "15.99". "" when not said.
- currency: "USD" unless they named PYUSD.
- date: the next payment date as YYYY-MM-DD. Resolve "next Friday", "the 1st", "el 1 de noviembre" and similar against today's date. "" when not said.

Never invent a value the user did not say. An empty string means "not said" — the form will ask for what is missing. Today is {today}.`;

/**
 * Understand one spoken request.
 *
 * The audio goes straight to the model — no separate transcription step to
 * disagree with the interpretation of it, and one round trip instead of two.
 * A transcription service and a parser can each be right while the pair is
 * wrong; sending the sound itself is one question.
 *
 * Never throws: an absent client and a refused call both come back as a
 * reason, because the caller's fallback is a form the user can type into —
 * the path that always works, which is why voice is allowed to be optional.
 */
export async function parseSpokenService(base64: string, mimeType: string): Promise<SpokenResult> {
  const ai = getClient();
  if (!ai) {
    return { fields: null, source: null, reason: "No Gemini credentials are configured." };
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: SPOKEN_RULES.replace("{today}", today) },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: spokenSchema,
      },
    });

    const raw = response.text;
    if (!raw) throw new Error("the model returned nothing");

    const parsed = JSON.parse(raw) as Partial<SpokenService>;
    const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

    // Normalised here rather than trusted: a model that returns an amount as
    // a number, or a date in another shape, would put a value in the form the
    // date input cannot hold — and the operator would have to notice.
    const date = text(parsed.date);
    return {
      fields: {
        service: text(parsed.service),
        url: text(parsed.url),
        amount: text(parsed.amount),
        currency: parsed.currency === "PYUSD" ? "PYUSD" : "USD",
        date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      },
      source: "model",
      reason: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The reason is reported, never swallowed: the operator's only other view
    // of a failed call is the server console.
    return { fields: null, source: null, reason: `Gemini: ${message}` };
  }
}
