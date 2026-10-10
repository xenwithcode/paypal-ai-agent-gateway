// lib/auditTrail.ts
//
// The bitácora of one dollar: what was promised, what was proposed, and what
// PayPal ended up doing about it.
//
// Pure and dependency-free so it can be tested without a browser, an SDK or a
// licence — which matters here more than anywhere else, because this is the
// data behind the one feature in the product that *does* need a licence: AG
// Grid's master/detail. If the trail is wrong, the expansion shows it, and a
// wrong expansion is worse than no expansion at all.
//
// The row it reads is the order itself — the same object the panel, the server
// and the ledger already read. Nothing is fetched to fill it in: the point of
// a trail is that it is the record, not a reconstruction.

/** How a candidate stands against the human's decision. */
export type AuditState = "chosen" | "proposed" | "rejected";

export type AuditRow = {
  field: string;
  value: string;
  state?: AuditState;
  /** Right-aligned monospace, for the figures and the ids. */
  mono?: boolean;
};

type Candidate = { text?: string; price?: number | null; url?: string };

/** The minimum shape this module needs. Structural, so a test needs no grid. */
export type AuditInput = {
  what?: string;
  limit?: number;
  currency?: string;
  condition?: string;
  expires?: string;
  mode?: string;
  payee?: string;
  allowEndpoint?: string;
  status?: string;
  candidates?: Candidate[];
  matchedId?: number | null;
  chosenId?: number | null;
  conditionDetail?: string;
  paypalOrderId?: string;
  authorizationId?: string;
  capturedAt?: string;
  project?: string;
};

const money = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`;

/**
 * Everything one order knows about itself, as a list of rows.
 *
 * Four groups, in the order a reader asks for them:
 *
 *  1. **The envelope** — what was promised before anything moved. Ceiling,
 *     condition, window, mode, destination: the five fields the server judges.
 *  2. **The candidates** — what the search proposed and what the human did
 *     about it: the taken one is marked, the agent's own preference is shown
 *     as *proposed*, and the rest are struck through rather than hidden,
 *     because "the agent proposed three and you took one" is the record this
 *     product exists to keep.
 *  3. **The settlement** — the PayPal ids, if any ever existed. Their absence
 *     is the answer too: an order with no authorization id has never held
 *     money, and saying so beats leaving the row blank.
 *  4. **The verdict** — the detail line the server returned, verbatim.
 *
 * Nothing here invents a value. A field that was never set is skipped rather
 * than printed empty, so the trail never grows a row that reads as a fact
 * nobody recorded.
 */
export function auditTrailFor(row: AuditInput): AuditRow[] {
  const currency = row.currency ?? "USD";
  const rows: AuditRow[] = [];

  const say = (field: string, value: string | undefined, mono = false) => {
    const text = (value ?? "").trim();
    if (text) rows.push({ field, value: text, mono });
  };

  // ── The envelope ────────────────────────────────────────────────────────
  say("Order", row.what);
  if (typeof row.limit === "number" && Number.isFinite(row.limit)) {
    say("Ceiling", money(row.limit, currency), true);
  }
  say("Condition", row.condition || "none — settles on demand");
  say("Valid until", row.expires || "no expiry");
  say("Mode", row.mode || "Autonomous");
  say("Recipient", row.payee || "none named");
  say("Endpoint", row.allowEndpoint || "none restricted");
  say("Campaign", row.project);

  // ── The candidates ──────────────────────────────────────────────────────
  //
  // Three different answers, and conflating them is how a trail starts lying:
  // `chosenId` is what the **human** took; `matchedId` is what the **agent**
  // would have taken. When they agree the human confirmed the pick; when they
  // differ that is the override this product exists to record; and when the
  // human chose nothing but the agent had an opinion, the opinion is shown as
  // *proposed*, not as chosen — an agent's preference is not a consent.
  const candidates = Array.isArray(row.candidates) ? row.candidates : [];
  candidates.forEach((candidate, index) => {
    const state: AuditState | undefined =
      index === row.chosenId ? "chosen" : index === row.matchedId ? "proposed" : "rejected";
    const price = typeof candidate.price === "number" ? money(candidate.price, currency) : "";
    const text = (candidate.text ?? "").trim() || `Candidate ${index + 1}`;
    rows.push({ field: `Candidate ${index + 1}`, value: [text, price].filter(Boolean).join(" · "), state });
  });

  // ── The settlement ──────────────────────────────────────────────────────
  say("PayPal order", row.paypalOrderId, true);
  say("Authorization", row.authorizationId, true);
  say("Captured", row.capturedAt, true);
  // A settled order with no PayPal id at all moved no money, and the trail
  // says that rather than ending in silence.
  if (
    row.status === "Captured" &&
    !row.paypalOrderId &&
    !row.authorizationId &&
    row.capturedAt
  ) {
    say("Settled as", "a demonstration — no PayPal order was created", true);
  }

  // ── The verdict ─────────────────────────────────────────────────────────
  say("Server said", row.conditionDetail);

  return rows;
}
