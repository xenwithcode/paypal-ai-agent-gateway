// lib/voice/turn.ts
//
// Two rules about one voice turn, and the reason they live together: both
// decide what the *next* turn gets to see — one by writing the human's half
// of the memory, the other by refusing to end the turn while a question of
// ours is still open.
//
// They are pure on purpose, for the same reason `lib/voice/tools.ts` is: the
// SDK is not importable in a test with no credentials, and these two rules
// are exactly the ones whose failure is invisible until it is expensive — a
// dropped transcript reads as a model that "did not understand", and a dialog
// that closes on its own question reads as an agent that stopped listening.
//

/**
 * What one side said, cleaned for the record.
 *
 * Live answers can arrive carrying silence markers (`<no speech>{pause}`) or
 * wrapped in quotation marks the transcriber thought were helpful. A marker
 * is not a word: remembered as one, it becomes the sentence a model reads as
 * the human's answer to a ceiling question. The rules here are deliberately
 * conservative — trim, unwrap, collapse — because this text is about to be
 * attributed to a person who is about to spend money, and inventing so much
 * as a comma for them would be worse than leaving their words rough.
 */
export function normaliseTranscription(raw: unknown): string {
  if (typeof raw !== "string") return "";

  const text = raw
    .replace(/<no speech>/gi, " ")
    .replace(/\{pause\}/gi, " ")
    .trim();

  // One layer of wrapping quotes, only when they wrap the whole line: a name
  // in the middle of a sentence ("the chelsea boots") must keep its quotes.
  // `[\s\S]` rather than `.*` with the dotAll flag — the suite runs on this
  // project's own target, and a pattern that needs a newer one is a pattern
  // that does not run everywhere this file is loaded.
  const unwrapped = text.match(/^["'“”‘’]([\s\S]*)["'“”‘’]$/);
  return (unwrapped?.[1] ?? text).replace(/\s+/g, " ").trim();
}

/**
 * Did the agent's last spoken line leave a question open?
 *
 * When it did, the turn is not over: the dialog stays on, the microphone goes
 * straight back to listening, and the human's answer arrives as the next turn
 * of *this* conversation instead of as a fresh one. That is the whole product
 * rule the ceiling question rests on — *"name the maximum, then I search"* —
 * and closing the dialog between the two halves is what made a spoken order
 * without an amount look like an agent that had hung up.
 *
 * The test is the question mark, and only that. Guessing from intent would
 * mean reading a tone the transcript does not carry; a sentence that does not
 * end in a question mark closes the dialog exactly as it always did, and the
 * operator's own click starts the next turn.
 */
export function expectsReply(spoken: unknown): boolean {
  if (typeof spoken !== "string") return false;
  const trimmed = spoken.trim();
  if (!trimmed) return false;
  return trimmed.endsWith("?");
}
