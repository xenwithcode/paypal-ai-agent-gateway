// tests/voice-turn.test.ts
//
// The two rules that decide what the *next* voice turn sees.
//
// Both failures they guard against were invisible until they were expensive:
// a transcript that arrives carrying the transcriber's silence markers becomes
// the sentence a spending model reads as the human's answer, and a dialog that
// closes on its own question makes a spoken order look like an agent that
// hung up mid-ask. Neither can be checked with a microphone, so both are pure
// and pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { expectsReply, normaliseTranscription } from "../lib/voice/turn.ts";

test("a line ending in a question keeps the dialog open", () => {
  // The ceiling question, in both languages the gateway asks it — the case
  // this rule exists for: the agent asks, and must still be listening when
  // the amount arrives.
  assert.equal(expectsReply("¿Cuánto tienes disponible para este gasto?"), true);
  assert.equal(expectsReply("Name the most this order may ever cost?"), true);
  assert.equal(expectsReply("Which one do you like?"), true);
});

test("trailing silence does not turn a question into a report", () => {
  assert.equal(expectsReply("  ¿Qué botas quieres comprar?  "), true);
  assert.equal(expectsReply("how much?\n"), true);
});

test("a report, a confirmation and silence all close the dialog", () => {
  assert.equal(expectsReply("Drafted order #5, awaiting your approval."), false);
  assert.equal(expectsReply("Encontré tres candidatos — ¿cuál te gusta"), false);
  assert.equal(expectsReply(""), false);
  assert.equal(expectsReply("   "), false);
  // A question mark in the middle of a sentence is punctuation, not a turn:
  // "under $150? the chelsea boots are $90" answers itself.
  assert.equal(expectsReply("under $150? the chelsea boots are $90."), false);
  // Anything that is not speech at all must not be read as a question.
  assert.equal(expectsReply(undefined), false);
  assert.equal(expectsReply(null), false);
});

test("a marker is not a word, and never becomes one in the record", () => {
  // Observed against this configuration: a turn carrying no speech comes back
  // as `<no speech>{pause}`. Remembered verbatim it would be the "answer" to
  // a ceiling question that nobody gave.
  assert.equal(normaliseTranscription("<no speech>{pause}"), "");
  assert.equal(normaliseTranscription("  <no speech>{pause} "), "");
  assert.equal(normaliseTranscription("  150 dólares  "), "150 dólares");
});

test("one layer of wrapping quotes is the transcriber's, not the speaker's", () => {
  assert.equal(normaliseTranscription('"busca chelsea boots"'), "busca chelsea boots");
  assert.equal(normaliseTranscription("“hasta 150 dólares”"), "hasta 150 dólares");
  assert.equal(normaliseTranscription("'una chaqueta para montar'"), "una chaqueta para montar");
  // …and only that layer: the quotes the person actually spoke stay theirs.
  assert.equal(normaliseTranscription('dice "chelsea boots" por favor'), 'dice "chelsea boots" por favor');
  // One wrap removed, the speaker's own quotes left where they put them.
  assert.equal(normaliseTranscription('"dice "chelsea boots""'), 'dice "chelsea boots"');
});

test("whitespace collapses and non-speech never reaches the memory", () => {
  assert.equal(normaliseTranscription("busca   chelsea\tboots\n"), "busca chelsea boots");
  assert.equal(normaliseTranscription(undefined), "");
  assert.equal(normaliseTranscription(42), "");
  assert.equal(normaliseTranscription(""), "");
});
