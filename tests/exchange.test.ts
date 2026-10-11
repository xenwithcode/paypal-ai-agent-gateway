// tests/exchange.test.ts
//
// The exchange rail, and the four ways it used to lie.
//
// The screen this replaces asked for a *recipient bank* it could not instruct,
// quoted a rate it could not commit to, and promised a settlement with nothing
// holding the other side to it. Each of those is an assert below rather than a
// note in a comment, because a rule written only in prose is a rule the next
// edit breaks.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXCHANGE_CONDITION,
  EXCHANGE_WINDOW_DAYS,
  legInstructions,
  prepareExchange,
} from "../lib/exchange.ts";
import { evaluateCondition } from "../lib/commerce/catalog.ts";
import { MODE, STATUS } from "../lib/policy.ts";

const complete = {
  youGive: { amount: 20, currency: "USD" },
  theyGive: { amount: 730_000, currency: "VES" },
  payee: "counterparty@example.com",
  local: { bank: "0134", phone: "04121234567", cedula: "V-12345678" },
  rate: { vesPerUsd: 36.5 },
};

test("only a human can settle it, and the judge says so", () => {
  // The condition is true or false in a person's head: no clock and no
  // catalog price can prove a deposit landed. `unverified` is the state the
  // Protection column reads as "a person has to decide" — never `met`, which
  // would let the agent take the dollars on its own.
  assert.equal(evaluateCondition(EXCHANGE_CONDITION, null).met, null);

  const quote = prepareExchange(complete);
  assert.equal(quote.mode, MODE.copilot, "copilot always: the agent proposes, a person settles");
  assert.equal(quote.status, STATUS.pending, "and it starts by asking");
});

test("the grid's sentence names both legs and the rate", () => {
  const quote = prepareExchange(complete);

  assert.match(quote.what, /20\.00 USD/);
  assert.match(quote.what, /730,000\.00 VES/);
  assert.match(quote.what, /36\.50 VES\/USD/);
  assert.equal(quote.limit, 20, "the ceiling is the dollars — the bolívares are not ours to hold");
  assert.equal(quote.currency, "USD");
  assert.equal(quote.payee, "counterparty@example.com", "the dollar leg is aimed at a person");
});

test("it expires, so nobody is left holding half a deal", () => {
  const today = new Date("2026-10-11T12:00:00Z");
  const quote = prepareExchange(complete, today);

  // Recomputed here with the same calendar rule the module uses: a raw date
  // would make this test pass or fail depending on the machine's timezone.
  const expected = new Date(today.getFullYear(), today.getMonth(), today.getDate() + EXCHANGE_WINDOW_DAYS);
  const iso = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(
    expected.getDate()
  ).padStart(2, "0")}`;

  assert.equal(quote.expires, iso);
  assert.equal(EXCHANGE_WINDOW_DAYS, 3);
});

test("every reason it cannot be prepared is said, not just the first", () => {
  const quote = prepareExchange(
    {
      youGive: { amount: 0, currency: "USD" },
      theyGive: { amount: Number.NaN, currency: "VES" },
      payee: "not-an-email",
      local: { bank: "", phone: "", cedula: "" },
      rate: null,
    }
  );

  // Five rules, five sentences: a caller who hears only about the amount
  // fixes the amount and runs straight into the next one.
  assert.equal(quote.violations.length, 5);
  assert.match(quote.what, /incomplete/);
});

test("the instructions never claim we move the bolívares", () => {
  const quote = prepareExchange(complete);
  const lines = legInstructions(complete, quote).join(" ");
  assert.ok(lines.length > 0, "a prepared exchange prints the reference to read");

  // The wording is the rule: this app does not talk to a bank.
  assert.match(lines, /between you two, outside this app/);
  assert.match(lines, /0134/);
  assert.match(lines, /V-12345678/);
  assert.match(lines, /730,000\.00 VES/);
  assert.match(lines, new RegExp(quote.expires));
  for (const banned of ["we transfer", "our bank", "we send to the bank"]) {
    assert.equal(lines.toLowerCase().includes(banned), false, `the copy may not say "${banned}"`);
  }
});

test("an incomplete exchange prints no instructions at all", () => {
  const quote = prepareExchange({ ...complete, payee: "" });
  assert.equal(quote.violations.length, 1);
  assert.deepEqual(legInstructions(complete, quote), [], "half a reference is not a reference");
});

test("both directions are the same exchange, written from the other side", () => {
  const buy = prepareExchange(complete);
  const sell = prepareExchange({
    ...complete,
    youGive: { amount: 730_000, currency: "VES" },
    theyGive: { amount: 20, currency: "USD" },
  });

  assert.match(buy.what, /^Exchange · 20\.00 USD/);
  assert.match(sell.what, /^Exchange · 730,000\.00 VES/);
  assert.equal(sell.limit, 730_000, "what you are giving is what the order holds", );
});
