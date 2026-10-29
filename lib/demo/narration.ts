// lib/demo/narration.ts
//
// What the demo says out loud, and which voice says it.
//
// The captions in `script.ts` are already the demo's narration; this module
// turns one into text a synthesiser reads the way a person would say it, and
// picks the least robotic voice the machine has to say it with. Both halves
// are pure — the DOM owns the speaking, everything the speaking *decides*
// lives here and runs under the same `node:test` runner as the rest of the
// repo.
//
// Why the choice has to be made by rule: `speechSynthesis.getVoices()`
// returns everything the OS offers — neural voices next to twenty-year-old
// compact ones — in the system's order, not ours. Taking the first would hand
// the demo to whatever voice the machine happens to list first, which on a
// judge's laptop is exactly how a narration starts sounding like a robot
// reading a script.

/** The subset of `SpeechSynthesisVoice` this module reads. */
export type VoiceInfo = {
  name: string;
  lang: string;
  default?: boolean;
};

/**
 * How long narration may stretch a step past its scripted hold.
 *
 * The hold is a reading minimum; a sentence that is still being read gets to
 * finish — but not forever. Twelve seconds is comfortably longer than any
 * caption in the script and short enough that a synthesiser which never fires
 * its end event cannot stall the kiosk.
 */
export const SPEECH_GRACE_MS = 12_000;

/**
 * The voice that should read the captions, or `null` for silence.
 *
 * `null` is a real answer, not a failure: a machine with no English voice
 * gets a caption the judge reads instead of an accent mangling it. Anything
 * English is eligible; the scoring inside decides how much it is wanted.
 */
export function pickVoice<T extends VoiceInfo>(voices: readonly T[]): T | null {
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang.trim()));
  if (english.length === 0) return null;

  let best: T | null = null;
  let bestScore = -Infinity;
  for (const voice of english) {
    const score = voiceScore(voice);
    // Strictly greater: on a tie the voice the system listed first wins,
    // so the choice is stable across renders.
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best;
}

/** How much a voice is wanted. Bigger is better; ties are broken by order. */
function voiceScore(voice: VoiceInfo): number {
  const name = voice.name.toLowerCase();
  let score = 0;

  // Quality first: neural / natural voices read like a person.
  if (/neural|natural/.test(name)) score += 60;
  // Chrome's bundled voices are plain but clean, and they are what a
  // stock Chrome on Linux offers at all.
  if (/google/.test(name)) score += 30;
  if (voice.default) score += 5;

  // Dialect: the captions are written in US English, but every English
  // voice beats silence, so the rest are merely less preferred.
  if (/^en[-_]us/i.test(voice.lang.trim())) score += 20;
  else score += 5;

  // The robotic ones. macOS labels its oldest voices "Compact", and anything
  // built on espeak reads like one — either would give the whole demo away
  // as a machine reciting lines, which is the one thing narration must not
  // sound like.
  if (/compact/.test(name)) score -= 100;
  if (/espeak|loquash?|robot/.test(name)) score -= 100;

  return score;
}

/**
 * Turn a caption into text spoken the way it is meant to be read.
 *
 * The written caption keeps the page's typography — em dashes, the ✕ the
 * close button is labelled with, prices with their dollar sign — and a
 * synthesiser reads each of those as a word ("dash", "multiplication sign")
 * or drops it. Only what gets *spoken* is rewritten; what the judge reads on
 * screen never changes.
 */
export function forSpeech(caption: string): string {
  return (
    caption
      .replace(/—/g, ", ") // a pause, not the word "dash"
      .replace(/✕/g, "X") // "Press X to look around"
      .replace(/\$([\d][\d,]*)/g, "$1 dollars") // "$20" → "20 dollars"
      .replace(/\s+/g, " ")
      .replace(/\s+,/g, ",") // "money , the last click" → "money, the last click"
      .trim()
  );
}
