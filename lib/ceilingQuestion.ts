// lib/ceilingQuestion.ts
//
// The one sentence this gateway says when a request names no amount.
//
// It is worth its own module because the sentence is the product's thesis
// said out loud: *an order without a ceiling is not an order, so the agent
// asks instead of inventing*. And it is asked **in the language the human
// just used** — a person who writes in Spanish and gets an English
// instruction back has been answered by the wrong half of the product, and
// the line is also what the voice agent speaks aloud, so the language of the
// question is the language of the conversation.
//
// The detection is deliberately cheap and deliberately conservative: an
// accented letter (or ¿ ¡) settles it, otherwise at least two distinct
// Spanish words have to appear. One shared word is not evidence — "buy me a
// jacket" contains "me" — and a question wrongly answered in the other
// language is worse than one answered late, so the English sentence is the
// default whenever the text is ambiguous.

/** Accents and the two inverted marks exist in Spanish and nowhere in English. */
const SPANISH_CHARS = /[áéíóúñü¿¡]/i;

/**
 * Spanish words an English request is unlikely to carry.
 *
 * Deliberately includes the short function words (`de`, `la`, `para`) that
 * make Spanish recognisable at a glance — but they only ever count together,
 * because the *set* is what is compared, not the number of occurrences.
 *
 * Two English words are absent on purpose: `son` and `solo` exist in both
 * languages, and a false "this request is Spanish" is the failure that
 * answers somebody in the wrong tongue. Two markers are required, so one
 * shared word ("buy **me** a jacket") can never decide it.
 */
const SPANISH_WORDS =
  /\b(?:el|la|los|las|un|una|unos|unas|de|del|al|que|qué|para|pero|porque|con|sin|por|en|mi|tu|me|te|se|lo|es|hay|como|cómo|cuando|cuánto|cuanto|cuántos|cuantos|cuántas|cuantas|dónde|donde|quiero|necesito|comprar|comprarme|comprame|búscame|buscame|encuéntrame|encuentrame|hasta|sobre|tengo|tienes|tiene|gasto|gastar|presupuesto|precio|costo|talla|dinero|disponible|favor|puedo|puedes|debería|deberia|sería|seria|artículo|articulo|producto|envío|envio|fecha|límite|limite|máximo|maximo|más|mas|menos|hoy|mañana|manana|ahora|mejor|también|tambien|aquí|esta|está)\b/gi;

/** True when the request was written in Spanish, false when unsure. */
export function isSpanish(text: string): boolean {
  if (SPANISH_CHARS.test(text)) return true;
  const words = text.toLowerCase().match(SPANISH_WORDS) ?? [];
  return new Set(words).size >= 2;
}

/**
 * The question, in the language of the request that earned it.
 *
 * `prompt` is the raw intent, not the parsed policy: the point is to answer
 * the human in the words *they* chose, before anything has been understood
 * about what they want to buy.
 */
export function ceilingQuestion(prompt: string): string {
  return isSpanish(prompt)
    ? "¿Cuánto tienes disponible para este gasto? — una orden sin monto no es una orden: " +
        "dime el máximo que puede costar y recién ahí empiezo a buscar, " +
        'p. ej. "una chaqueta para montar, hasta 150 dólares".'
    : 'Name the most this order may ever cost — an order without a ceiling is not an order this gateway drafts. Say it in the request, e.g. "a jacket for riding, under 150 dollars".';
}
