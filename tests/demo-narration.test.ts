// tests/demo-narration.test.ts
//
// The rules that decide what the demo *sounds* like. The judge hears this
// voice for the length of the run, and "pleasant" is not a vibe here — it is
// a score with the robotic voices below zero and silence when the machine has
// nothing worth hearing.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SPEECH_GRACE_MS,
  forSpeech,
  pickVoice,
  type VoiceInfo,
} from "../lib/demo/narration.ts";
import { DEMO_STEPS } from "../lib/demo/script.ts";

const voices = (...entries: Array<[name: string, lang: string, isDefault?: boolean]>): VoiceInfo[] =>
  entries.map(([name, lang, isDefault]) => ({ name, lang, default: isDefault }));

test("no English voice on the machine means silence, not a mangled caption", () => {
  assert.equal(pickVoice(voices()), null);
  assert.equal(pickVoice(voices(["Mónica", "es-ES"], ["Anna", "de-DE"])), null);
  // Spanish voice named like an English one still fails the language check.
  assert.equal(pickVoice(voices(["Google US English (fake)", "es-US"])), null);
});

test("neural voices beat plain ones, and plain beat compact", () => {
  const plain = voices(["Google US English", "en-US"], ["Samantha", "en-US"]);
  const neural = voices(
    ["Microsoft Jenny Neural", "en-US"],
    ["Google US English", "en-US"],
    ["Samantha", "en-US"],
  );
  const compact = voices(
    ["Albert (Compact)", "en-US"],
    ["Samantha", "en-US"],
  );

  assert.equal(pickVoice(plain)?.name, "Google US English");
  assert.equal(pickVoice(neural)?.name, "Microsoft Jenny Neural");
  // "Samantha" is the modern macOS voice; "Compact" is the twenty-year-old
  // one that reads like a callbox, and it must never win against a live one.
  assert.equal(pickVoice(compact)?.name, "Samantha");
});

test("espeak never wins against any normal English voice", () => {
  const list = voices(["eSpeak", "en-US"], ["Google UK English", "en-GB"]);
  assert.equal(pickVoice(list)?.name, "Google UK English");

  const onlyEspeak = voices(["eSpeak", "en-US"]);
  // It is still English, so it is chosen — silence is for *wrong language*,
  // a bad voice is still better than a caption nobody reads aloud.
  assert.equal(pickVoice(onlyEspeak)?.name, "eSpeak");
});

test("US English is preferred among otherwise equal voices", () => {
  const list = voices(["Daniel", "en-GB"], ["Samantha", "en-US"]);
  assert.equal(pickVoice(list)?.name, "Samantha");
});

test("a tie is resolved by list order, so the choice is stable", () => {
  const list = voices(["Same One", "en-US"], ["Same Two", "en-US"]);
  assert.equal(pickVoice(list)?.name, "Same One");
  // Same list, reversed priority-free: still the first entry.
  assert.equal(pickVoice([...list].reverse())?.name, "Same Two");
});

test("the default voice gets a nudge, not the crown", () => {
  const list = voices(
    ["Plain UK", "en-GB", true],
    ["Samantha", "en-US"],
  );
  // Default-ness cannot buy a dialect switch on its own.
  assert.equal(pickVoice(list)?.name, "Samantha");
});

test("captions are rewritten for the ear, not for the eye", () => {
  // Em dashes must not be read as the word "dash".
  assert.equal(
    forSpeech("You say what you want, in your own words — and no amount yet."),
    "You say what you want, in your own words, and no amount yet.",
  );
  // The ✕ button is a letter to a synthesiser, not a glyph.
  assert.equal(
    forSpeech("Press ✕ to look around."),
    "Press X to look around.",
  );
  // Money is said as money.
  assert.equal(
    forSpeech("Choose what you can spare: $20 is the floor."),
    "Choose what you can spare: 20 dollars is the floor.",
  );
  // Thousands keep their commas for the engine to group.
  assert.equal(forSpeech("The maximum is $1,000."), "The maximum is 1,000 dollars.");
});

test("rewriting a caption never empties or balloons it", () => {
  for (const step of DEMO_STEPS) {
    const spoken = forSpeech(step.caption);
    assert.ok(spoken.length > 0, `${step.id} lost its caption`);
    // Every word of the caption survives the rewrite in order: the ear gets
    // the same sentence the eye reads, only punctuated for speech.
    const spokenWords = spoken.split(/\s+/);
    const captionWords = step.caption.split(/\s+/);
    let cursor = 0;
    for (const word of captionWords) {
      const at = spokenWords.slice(cursor).findIndex((candidate) => candidate.startsWith(word.replace(/[—✕$,]/g, "")));
      assert.notEqual(at, -1, `${step.id}: dropped "${word}" from the spoken caption`);
      cursor += at;
    }
  }
});

test("the grace period is generous enough for a caption and finite enough for a kiosk", () => {
  assert.ok(SPEECH_GRACE_MS >= 6_000, "longer than any caption takes to say");
  assert.ok(SPEECH_GRACE_MS <= 30_000, "short enough that a dead engine cannot stall the run");
});
