// tests/ceiling-question.test.ts
//
// The gateway's only question — *"name the most this order may cost"* — is
// asked before anything has been understood about the request, and the voice
// agent speaks this very sentence out loud. So its language is not cosmetic:
// a person who writes in Spanish and is answered in English has just been
// handed an instruction by the wrong half of the product.
//
// Detection is conservative on purpose and these tests hold it there in both
// directions: Spanish must be recognised without accents (people type
// "cuanto", not "cuánto"), and English must never be mistaken for Spanish
// over a single shared word — `son` and `solo` belong to both languages, and
// "buy me a jacket" contains `me`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ceilingQuestion, isSpanish } from "../lib/ceilingQuestion.ts";

const SPANISH =
  "¿Cuánto tienes disponible para este gasto? — una orden sin monto no es una orden: " +
  'dime el máximo que puede costar y recién ahí empiezo a buscar, p. ej. "una chaqueta para montar, hasta 150 dólares".';
const ENGLISH =
  'Name the most this order may ever cost — an order without a ceiling is not an order this gateway drafts. Say it in the request, e.g. "a jacket for riding, under 150 dollars".';

test("a request written in Spanish is asked in Spanish", () => {
  assert.equal(ceilingQuestion("Quiero comprar una chaqueta para montar moto"), SPANISH);
  assert.equal(isSpanish("Quiero comprar una chaqueta para montar moto"), true);
});

test("Spanish without accents still counts as Spanish", () => {
  assert.equal(ceilingQuestion("comprar unos tenis sin precio"), SPANISH);
  assert.equal(isSpanish("cuanto tengo para gastar"), true);
});

test("an English request keeps the English sentence, character for character", () => {
  assert.equal(ceilingQuestion("buy me a jacket for riding"), ENGLISH);
  assert.equal(isSpanish("buy me a jacket for riding"), false);
});

test("one shared word is not evidence of Spanish", () => {
  // `me`, `son` and `solo` are all English too — the set needs two markers.
  assert.equal(isSpanish("give me the solo jacket"), false);
  assert.equal(isSpanish("their son likes solo travel"), false);
});

test("a mostly English request stays English even if it carries one Spanish word", () => {
  // Conservative by design: wrongly answering in the other language is the
  // worse mistake, so ambiguity falls back to English rather than guessing.
  assert.equal(isSpanish("white sneakers talla 42"), false);
});

test("both sentences say the same thing: give me the amount first", () => {
  assert.match(SPANISH, /máximo que puede costar/);
  assert.match(ENGLISH, /most this order may ever cost/);
  // The example in each must name an amount — an example without one would
  // teach the reader a request that gets refused.
  assert.match(SPANISH, /150 d[oó]lares/);
  assert.match(ENGLISH, /150 dollars/);
});
