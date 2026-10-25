// tests/fallback-ceiling.test.ts
//
// The question the gateway asks before it searches anything — *"name the most
// this order may ever cost"* — is only ever reached when the parser returns
// limit 0. So the rule that decides when a request has an amount is not a
// parsing detail: it is the whole of that question.
//
// It was broken on the path that needs it most. Without Gemini credentials
// (`source: "fallback"`, which is what the deployed demo runs), the parser
// filled a missing ceiling with **25% of the account balance** — so every
// draft arrived already priced at a number nobody said, `/api/agent`'s
// `limit <= 0` guard never fired, and the strip offered real products for a
// budget the human never gave. Three ways to get there, all of them a spend
// nobody authorised:
//
//   "quiero una chaqueta"        → 620 USD  (25% of a 2,480 balance)
//   "comprar 2 camisetas"        → 2 USD    (a quantity read as a price)
//   "un regalo hasta el 25"      → 25 USD   (a date read as a price)
//
// These tests pin `extractCeiling` — the pure function both paths lean on —
// and one end-to-end call through `parseUserIntention` with the credentials
// removed, because a rule that only holds while a model is reachable is not
// the rule the route enforces.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { extractCeiling, parseUserIntention } from "../lib/gemini.ts";

// The fallback path only runs when nothing is configured, so the credentials
// this machine may have are taken away for the duration of the file. Saved
// and restored rather than left deleted: the test runner gives each file its
// own process, but a rule about borrowed state should leave it as it was.
const saved: Record<string, string | undefined> = {};
const KEYS = ["GCP_PROJECT", "GCP_LOCATION", "GEMINI_API_KEY"];

before(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

after(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

// ─── No amount named → no ceiling ──────────────────────────────────────────

test("a request that names no amount has no ceiling", () => {
  assert.equal(extractCeiling("Quiero comprar una chaqueta para montar moto"), 0);
  assert.equal(extractCeiling("buy me a jacket for riding"), 0);
  assert.equal(extractCeiling("quiero pedir comida hoy"), 0);
});

test("a quantity is not a budget", () => {
  assert.equal(extractCeiling("comprar 2 camisetas para el gimnasio"), 0);
  assert.equal(extractCeiling("3 pairs of socks"), 0);
});

test("a size is not a budget", () => {
  assert.equal(extractCeiling("necesito unos tenis blancos talla 42"), 0);
  assert.equal(extractCeiling("white sneakers, size 10, by Friday"), 0);
});

test("a number inside a date is a date, not a price", () => {
  assert.equal(extractCeiling("hasta el 25 de octubre"), 0);
  assert.equal(extractCeiling("regalo hasta el 31 de diciembre"), 0);
  assert.equal(extractCeiling("up to the 27th of November"), 0);
});

test("the balance is never read as an amount the human said", () => {
  // The old fallback's move: no amount in the sentence, so take a slice of
  // what the account holds. Nothing in the text may produce a number here.
  assert.equal(extractCeiling("quiero gastar lo que tengas disponible"), 0);
});

// ─── An amount was named → it is the ceiling ───────────────────────────────

test("a currency-adjacent amount is a ceiling", () => {
  assert.equal(extractCeiling("white sneakers only if the price drops to 60 USD"), 60);
  assert.equal(extractCeiling("un laptop hasta 500 dólares"), 500);
  assert.equal(extractCeiling("gift for mom under $50"), 50);
  assert.equal(extractCeiling("gift for mom 50$"), 50);
  assert.equal(extractCeiling("budget of 900 PYUSD"), 900);
  assert.equal(extractCeiling("mándame 1,200 VES"), 1200);
});

test("a keyword-adjacent amount is a ceiling", () => {
  assert.equal(extractCeiling("jacket for riding, under 900"), 900);
  assert.equal(extractCeiling("headphones at most 80"), 80);
  assert.equal(extractCeiling("un regalo, no más de 50"), 50);
  assert.equal(extractCeiling("menor que 50"), 50);
});

test("a deadline at the head of the sentence does not hide a real amount", () => {
  // The first keyword match is a date; skipping it must continue the search,
  // not end it — otherwise asking about a deadline would cost the ceiling.
  assert.equal(extractCeiling("hasta el 25 de octubre, precio 60"), 60);
});

// ─── The rule the route enforces, end to end ───────────────────────────────

test("without credentials a request with no amount still comes back at 0", async () => {
  const { policy, source } = await parseUserIntention(
    "Quiero comprar una chaqueta para montar moto",
    "2480.00"
  );
  assert.equal(source, "fallback", "this test is about the path with no model");
  assert.equal(
    policy.limit,
    0,
    "the fallback must not price a request nobody priced — 0 is what makes the gateway ask"
  );
  assert.equal(policy.condition, "", "there is no ceiling, so there is no condition either");
});

test("without credentials a named amount is still honoured, and capped by the balance", async () => {
  const within = await parseUserIntention("chaqueta bajo 150 USD", "2480.00");
  assert.equal(within.source, "fallback");
  assert.equal(within.policy.limit, 150);

  const above = await parseUserIntention("chaqueta hasta 5000 dólares", "2480.00");
  assert.equal(above.policy.limit, 2480, "a ceiling above the balance is reduced to the balance");
});
