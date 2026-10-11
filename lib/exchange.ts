// lib/exchange.ts
//
// A two-sided exchange between two people who do not trust each other yet:
// dollars on one side, bolívares on the other, and neither goes first.
//
// The rail this replaces asked for a *recipient bank* — a field implying a
// movement this build cannot perform, because no bank is connected and no
// bank will be. This one asks for nothing it cannot do:
//
//   · the dollar side is a **PayPal order, held by PayPal**. This app never
//     holds money; it holds the *permission* to move it, which is the whole
//     thesis of the product applied to a deal between two people;
//   · the bolívar side happens **between the two of them**, bank to bank,
//     which is where it has always happened. The app prints the instructions
//     and the reference, and stops there — it does not pretend to instruct a
//     bank it has no agreement with;
//   · the condition that releases the dollars is **a human confirming that
//     the bolívares arrived**. It is deliberately unreadable by the judge: no
//     clock and no catalog price can prove a deposit landed, so the agent may
//     never settle this one alone — the tests below are what keeps that true;
//   · and it **expires**, so neither side can be left holding half a deal: an
//     unconfirmed hold is released, and the dollars come back.
//
// Pure: no SDK, no fetch, no clock of its own — `today` is a parameter, as
// everywhere else in `lib/`.
import { MODE, STATUS } from "./policy.ts";

/**
 * How long the dollars stay held waiting for the bolívares.
 *
 * Three days is a decision, not a fact: long enough for a bank transfer
 * between two people, short enough that a deal which is not going to happen
 * releases quickly. The panel prints it, so the counterparty reads it before
 * agreeing rather than discovering it afterwards.
 */
export const EXCHANGE_WINDOW_DAYS = 3;

/**
 * The condition, said once.
 *
 * Chosen to be true or false only in a human's head. `evaluateCondition`
 * answers *unverified* for it — not *met*, and not *not met* — which is
 * exactly the state the Protection column reads as "a person has to decide".
 */
export const EXCHANGE_CONDITION = "confirm the bolívares arrived";

export type ExchangeInput = {
  /** What this side gives, in the currency it is counted in. */
  youGive: { amount: number; currency: string };
  /** What the other side gives, at the rate the quote was taken at. */
  theyGive: { amount: number; currency: string };
  /** The PayPal account the dollar leg is directed to — written into the order. */
  payee: string;
  /** The Pago Móvil reference the bolívar leg is made out to. */
  local: { bank: string; phone: string; cedula: string };
  /** The rate the quote was taken at, or null while the feed has not answered. */
  rate: { vesPerUsd: number } | null;
};

export type ExchangeQuote = {
  /** Everything that stops this from being prepared — all of it, never the first. */
  violations: string[];
  /**
   * The sentence the grid will show.
   *
   * Both legs and the rate, so the deal is checkable from the table alone: a
   * row that says only "exchange" is a row nobody can argue with later.
   */
  what: string;
  /** The human's confirmation — the one thing no function here can read. */
  condition: string;
  /** The last day the bolívares may arrive before the dollars are released. */
  expires: string;
  /** The ceiling of the order: the dollars, and nothing else. */
  limit: number;
  currency: string;
  payee: string;
  /** Copilot, always: see the note in `prepareExchange`. */
  mode: string;
  status: string;
};

/** Dollars as the panel writes them: `20.00`, `1,250.50`. */
function money(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Bolívares as the panel writes them: `730,000.00` — no thousands guessing. */
function bulk(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `from + days` as YYYY-MM-DD on this machine's calendar. */
function isoPlusDays(from: Date, days: number): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Judge an exchange before it becomes an order.
 *
 * Every rule here exists because the previous version of this screen broke
 * one of them: it printed a *recipient bank* it could not instruct, a rate it
 * could not commit to, and a promise of settlement with nothing holding the
 * other side to it.
 *
 * **Copilot, always.** The mode is not a parameter: an exchange is settled by
 * a person who can see that the bolívares landed, and no schedule or price
 * can see that. Handing it to the autonomous agent would be handing it to
 * something that cannot know.
 *
 * `today` is a parameter so the expiry can be pinned by a test rather than by
 * the day the suite runs.
 */
export function prepareExchange(input: ExchangeInput, today: Date = new Date()): ExchangeQuote {
  const violations: string[] = [];
  const dollars = input.youGive.amount;
  const bolivares = input.theyGive.amount;
  const paysInDollars = input.youGive.currency !== input.theyGive.currency;

  if (!Number.isFinite(dollars) || dollars <= 0) {
    violations.push("Say what you are giving — an amount greater than zero.");
  }
  if (!input.rate || !Number.isFinite(input.rate.vesPerUsd) || input.rate.vesPerUsd <= 0) {
    violations.push(
      "No live BCV rate is available, so the two sides cannot be checked against each other."
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.payee.trim())) {
    violations.push("The PayPal account of the dollar leg is missing or unreadable.");
  }
  if (!input.local.bank.trim() || !input.local.phone.trim() || !input.local.cedula.trim()) {
    violations.push(
      "The Pago Móvil reference is incomplete — bank, phone and cédula are what the other person reads to check the deposit."
    );
  }
  if (!Number.isFinite(bolivares) || bolivares <= 0) {
    violations.push("The bolívar side of the exchange is missing.");
  }

  const rate = input.rate?.vesPerUsd ?? 0;
  const what = violations.length
    ? "Exchange — incomplete"
    : paysInDollars
      ? `Exchange · ${money(dollars)} ${input.youGive.currency} for ${bulk(bolivares)} ${input.theyGive.currency} at ${money(rate)} VES/USD`
      : `Exchange · ${bulk(bolivares)} ${input.theyGive.currency} for ${money(dollars)} ${input.youGive.currency} at ${money(rate)} VES/USD`;

  return {
    violations,
    what,
    condition: EXCHANGE_CONDITION,
    expires: isoPlusDays(today, EXCHANGE_WINDOW_DAYS),
    limit: dollars,
    currency: input.youGive.currency,
    payee: input.payee.trim(),
    mode: MODE.copilot,
    status: STATUS.pending,
  };
}

/**
 * The bolívar leg, as instructions to read — never as an instruction we send.
 *
 * Written here rather than in the panel because the wording is the rule: this
 * app does not talk to a bank, and a screen that says "we transfer" is the
 * same lie the *Recipient bank* field was telling. The assertion below is on
 * the words themselves.
 */
export function legInstructions(input: ExchangeInput, quote: ExchangeQuote): string[] {
  if (quote.violations.length > 0) return [];
  return [
    "Pago Móvil · between you two, outside this app",
    `Bank ${input.local.bank} · Phone ${input.local.phone} · Cédula ${input.local.cedula}`,
    `Amount: ${bulk(input.theyGive.amount)} ${input.theyGive.currency}`,
    `Reference: ${quote.what}`,
    `If it has not arrived by ${quote.expires}, the dollars are released back to you.`,
  ];
}

/** The two endings, said out loud — so neither side has to trust the other. */
export function settlementRule(): string[] {
  return [
    "The bolívares arrive: you press *I received the bolívares* on the order, and the dollars are captured — PayPal moves them to the account named on it.",
    "They do not arrive by the date above: the hold expires and the dollars stay where they were. Nobody has to be trusted, because nobody has to be paid first.",
  ];
}
