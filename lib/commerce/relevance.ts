// lib/commerce/relevance.ts
//
// What the search found, judged against what was asked for.
//
// The catalog search is literal: it matches the words it is given. Ask for a
// "motorcycle riding jacket" in a catalog that holds motorcycles but no
// jackets and the word "motorcycle" alone is enough to return three bikes —
// offered confidently, priced in the thousands, and none of them a jacket.
// A human caught it. A judge watching a demo would have caught it. But the
// strip should not have offered it: the point of showing candidates is that
// the agent's choice becomes visible and overridable, not that every literal
// hit becomes a product card.
//
// So the keyword order is no longer the final word. The model reads the
// intent and the shortlist and keeps only the products that ARE what was
// asked for, each with one reason. This module decides what that verdict
// means for the strip — pure, so the rules can be tested without a model, a
// credential, or a network, the same way every other rule in this project is.
//
// The verdict itself is untrusted input, exactly like the parsed intent: it
// arrives from a model, so it is validated on the way in and may only narrow
// the list — never widen it. A pick naming a product that is not in the
// candidate list is ignored, not believed.

/** What the ranking model answered. */
export type RelevanceVerdict = {
  /** true when NOT ONE candidate is what the user asked for. */
  noneMatch: boolean;
  /** The candidates that DO match, best first, each with one short reason. */
  picks: { id: number; reason: string }[];
};

/** Why a reason is cut: it is a caption on a card, not an essay. */
export const MAX_REASON_CHARS = 140;

export type RelevanceResult<T extends { id: number }> = {
  /** The candidates the strip may show, in the model's order, with reasons. */
  kept: (T & { reason?: string })[];
  /** How many candidates the verdict set aside. The console reports it. */
  dropped: number;
  /**
   * The honest sentence when nothing matched — speakable, because the voice
   * reads it aloud. `null` whenever something matched or nothing could be
   * judged: a note about an empty result over a non-empty strip would
   * contradict the cards right next to it.
   */
  note: string | null;
};

/**
 * Apply the verdict to the candidates the catalog returned.
 *
 * Three decisions, each of them a way to be quietly wrong:
 *
 * **No verdict keeps everything.** The ranking call can fail — no
 * credentials, a timeout, a malformed answer — and when it does the strip
 * falls back to the keyword order exactly as it behaved before this module
 * existed. A missing opinion must never empty the list: the human still
 * sees the choice, still holds the reject button, and the server still
 * judges whatever they pick. What is gone is the *ranking*, not the option.
 *
 * **The verdict may only narrow.** Picks are matched against the candidates
 * by id; an id the catalog did not return cannot be conjured into the strip,
 * and a repeated id shows its product once. `noneMatch` wins over any picks
 * that contradict it — the stricter reading, because a model that says
 * "nothing matches" and then lists matches has not chosen, it has waffled,
 * and the price of guessing wrong here is a human being offered a motorcycle
 * for a jacket.
 *
 * **"Nothing matched" is said out loud, in full.** The order still gets
 * created — without a product, with the condition reading `unverified`,
 * exactly like any request the catalog cannot answer — but the operator and
 * the voice both hear why the strip they expected is not there.
 */
export function applyRelevance<T extends { id: number }>(
  candidates: readonly T[],
  verdict: RelevanceVerdict | null,
  intent: string
): RelevanceResult<T> {
  if (!verdict) {
    return { kept: candidates.map((product) => ({ ...product })), dropped: 0, note: null };
  }

  const known = new Map(candidates.map((product) => [product.id, product]));
  const seen = new Set<number>();
  const kept: (T & { reason?: string })[] = [];

  for (const pick of verdict.picks) {
    const product = known.get(pick.id);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    const reason = (pick.reason ?? "").trim().slice(0, MAX_REASON_CHARS);
    kept.push(reason ? { ...product, reason } : { ...product });
  }

  if (verdict.noneMatch || kept.length === 0) {
    return {
      kept: [],
      dropped: candidates.length,
      note: `Nothing in this catalog matches "${intent.trim()}" — no candidate was offered.`,
    };
  }

  return { kept, dropped: candidates.length - kept.length, note: null };
}
