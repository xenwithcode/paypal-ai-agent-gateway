// lib/demo/script.ts
//
// The film the judge watches when they press "Watch the demo".
//
// Three rules, each one load-bearing:
//
// 1. **It never moves money.** The last screen stops at PayPal's button. A
//    crowdfunding position added for the walkthrough is a *sample* row, drawn
//    in memory and marked as one — the store is not written and PayPal is not
//    called. What the demo proves is the preparation, which is the thesis.
// 2. **Every action is the page's own handler.** `draft` calls the same
//    `/api/agent`; `choose` calls the same commit the button calls; selecting
//    a project sets the same state the pin sets. There is no demo-only path
//    into anything that matters.
// 3. **The narration is a file, not the browser's robot.** The captions below
//    were recorded with Gemini TTS in **Aoede**, the voice the spoken agent
//    already uses, so the demo sounds like the product instead of like a
//    screen reader. The audio is static: no API key, no latency, no accent
//    lottery on a judge's laptop.

import type { DemoAction } from "./bus";

export type DemoFocus =
  | "intent"
  | "candidates"
  | "orders"
  | "order-card"
  | "flight"
  | "crowdfunding-map"
  | "crowdfunding-grid"
  | "crowdfunding-panel"
  | "crowdfunding-amount"
  | "crowdfunding-portfolio";

export type DemoRoute = "/overview" | "/crowdfunding";

export type DemoStep = {
  id: string;
  /** The group the progress rail prints. */
  chapter: "The purchase order" | "Where money grows";
  route: DemoRoute;
  /** What the judge reads at the bottom of the screen. */
  caption: string;
  /** What Aoede says. Expanded for the ear: "$60" → "sixty dollars". */
  narration: string;
  /** `/demo/audio/<id>.wav`, recorded once and shipped with the repo. */
  audio: string;
  /** Measured length of that file, used when audio is muted or unavailable. */
  durationMs: number;
  /** Reading time after the action lands; never shorter than a breath. */
  holdMs: number;
  focus?: DemoFocus;
  callout?: { eyebrow: string; title: string };
  action?: DemoAction;
  /** The full-screen opening card. The film ends on the result, and the kiosk's completion bar is the close. */
  intro?: boolean;
};

/**
 * The script. Order is the argument: a sentence becomes an envelope, the
 * envelope becomes a choice, the choice becomes money in flight — then the
 * same discipline is turned toward money that grows.
 */
export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: "01-intro",
    chapter: "The purchase order",
    route: "/overview",
    caption: "The agent prepares. You approve. PayPal pays.",
    narration:
      "This is PayPal AI Agent. An agent that can prepare your money, but can never move it. I'll show you both sides: a purchase it sets up, and an investment it prepares. You approve every payment.",
    audio: "/demo/audio/01-intro.wav",
    durationMs: 14451,
    holdMs: 700,
    intro: true,
  },
  {
    id: "02-request",
    chapter: "The purchase order",
    route: "/overview",
    caption:
      "It starts with a sentence: white sneakers under $120, by Friday, only if the price drops to $110 or less.",
    narration:
      "It starts with a sentence. White sneakers, under one hundred twenty dollars, by Friday, only if the price drops to one hundred ten or less. No forms. No syntax. Just what I want, and the rule that protects me.",
    audio: "/demo/audio/02-request.wav",
    durationMs: 16131,
    holdMs: 800,
    focus: "intent",
    callout: { eyebrow: "The request", title: "A sentence, not a form" },
    action: {
      surface: "overview",
      name: "fillIntent",
      arg: "white sneakers under 120 dollars, by Friday, only if the price drops to 110 dollars or less",
    },
  },
  {
    id: "03-search",
    chapter: "The purchase order",
    route: "/overview",
    caption:
      "The agent turns it into a purchase order — a $120 ceiling, a $110 condition, a Friday deadline — and only then searches.",
    narration:
      "The agent turns that into a purchase order. A ceiling: one hundred twenty dollars. A condition: the price must drop to one hundred ten. A deadline: Friday. Only then does it search. It cannot spend a number I never said.",
    audio: "/demo/audio/03-search.wav",
    durationMs: 16731,
    holdMs: 900,
    focus: "candidates",
    callout: { eyebrow: "The gateway", title: "It asks for a ceiling before it searches" },
    action: {
      surface: "overview",
      name: "draft",
      arg: "white sneakers under 120 dollars, by Friday, only if the price drops to 110 dollars or less",
    },
  },
  {
    id: "04-candidates",
    chapter: "The purchase order",
    route: "/overview",
    caption:
      "Every candidate, with the reason each survived. The agent's pick misses the condition; the choice is still yours.",
    narration:
      "It shows every candidate, with the reason each one survived. The agent's favourite is the first one, but it misses my condition. I choose the other. The model can suggest. It cannot decide.",
    audio: "/demo/audio/04-candidates.wav",
    durationMs: 14691,
    holdMs: 900,
    focus: "candidates",
    callout: { eyebrow: "The search", title: "Every candidate, and why it survived" },
  },
  {
    id: "05-choose",
    chapter: "The purchase order",
    route: "/overview",
    caption: "I choose the one that meets the rule. The order lands in Purchase orders as Awaiting approval.",
    narration:
      "I choose the one that meets my rule. The order lands in Purchase orders as Awaiting approval. Not one cent has moved.",
    audio: "/demo/audio/05-choose.wav",
    durationMs: 8931,
    holdMs: 800,
    focus: "order-card",
    callout: { eyebrow: "Your call", title: "The model suggests. You decide." },
    action: { surface: "overview", name: "choose", arg: "best" },
  },
  {
    id: "06-envelope",
    chapter: "The purchase order",
    route: "/overview",
    caption:
      "The envelope the agent can never break: the most it may spend, what must be true, and when its authority expires.",
    narration:
      "This is the envelope the agent can never break: the most it may spend, what must be true, and when its authority expires. The last click is mine, inside PayPal.",
    audio: "/demo/audio/06-envelope.wav",
    durationMs: 13371,
    holdMs: 900,
    focus: "order-card",
    callout: { eyebrow: "The envelope", title: "Ceiling · condition · expiry" },
  },
  {
    id: "07-purchase-orders",
    chapter: "The purchase order",
    route: "/overview",
    caption:
      "There it is in Purchase orders: Awaiting approval. One record — card, table and console.",
    narration:
      "And there it is in Purchase orders: Awaiting approval. The row, the card and the console are one record. The sample chip says nothing moved.",
    audio: "/demo/audio/07-purchase-orders.wav",
    durationMs: 11811,
    holdMs: 900,
    focus: "orders",
    callout: { eyebrow: "Purchase orders", title: "Awaiting approval — not paid" },
    action: { surface: "overview", name: "close" },
  },
  {
    id: "07-flight",
    chapter: "The purchase order",
    route: "/overview",
    caption:
      "Every claim on your money, in one picture: Awaiting approval, Reserved, Captured, Released.",
    narration:
      "Every claim on my money, in one picture. Awaiting approval. Reserved. Captured. Released. The order I just prepared is already here, as money in flight.",
    audio: "/demo/audio/07-flight.wav",
    durationMs: 12571,
    holdMs: 900,
    focus: "flight",
    callout: { eyebrow: "Money in flight", title: "Every claim on your money, in one picture" },
  },
  {
    id: "09-crowdfunding-map",
    chapter: "Where money grows",
    route: "/crowdfunding",
    caption: "Now the other side of money: where it goes to grow instead of leaving.",
    narration:
      "Now the other side of the product: where money grows instead of leaving. Real businesses in Venezuela, each raising for something specific.",
    audio: "/demo/audio/09-crowdfunding-map.wav",
    durationMs: 10371,
    holdMs: 900,
    focus: "crowdfunding-map",
    callout: { eyebrow: "Where the money goes", title: "Real businesses. Specific asks." },
  },
  {
    id: "10-crowdfunding-list",
    chapter: "Where money grows",
    route: "/crowdfunding",
    caption: "Choose the project you want to invest in — the row and the pin are the same decision.",
    narration:
      "I choose the project I want to invest in. The table and the map are two ways into the same decision: the business, and what stands behind it.",
    audio: "/demo/audio/10-crowdfunding-list.wav",
    durationMs: 10691,
    holdMs: 800,
    focus: "crowdfunding-grid",
    callout: { eyebrow: "Choose the project", title: "You pick the business, not an index" },
  },
  {
    id: "11-crowdfunding-select",
    chapter: "Where money grows",
    route: "/crowdfunding",
    caption:
      "Finca de Café El Samán: a coffee roaster in Yaracuy, 20% a year, backed by land and machinery.",
    narration:
      "Finca de Café El Samán: a coffee roaster in Yaracuy, offering twenty percent a year, backed by land and machinery. Twenty dollars is enough to start.",
    audio: "/demo/audio/11-crowdfunding-select.wav",
    durationMs: 12331,
    holdMs: 900,
    focus: "crowdfunding-panel",
    callout: { eyebrow: "The investment", title: "20% a year, backed by real assets" },
    action: { surface: "crowdfunding", name: "selectProject", arg: 1 },
  },
  {
    id: "12-crowdfunding-amount",
    chapter: "Where money grows",
    route: "/crowdfunding",
    caption:
      "The agent checks the amount against the campaign's rules and shows today's official BCV rate, with its source.",
    narration:
      "The agent checks my amount against the campaign's rules, and shows the cost in bolívares at today's official Central Bank rate, with its source and date.",
    audio: "/demo/audio/12-crowdfunding-amount.wav",
    durationMs: 10251,
    holdMs: 900,
    focus: "crowdfunding-amount",
    callout: { eyebrow: "Your amount", title: "The rate is today's, with its source" },
    action: { surface: "crowdfunding", name: "setAmount", arg: 100 },
  },
  {
    id: "13-crowdfunding-result",
    chapter: "Where money grows",
    route: "/crowdfunding",
    caption:
      "And here is the result in Your investments: reserved, not taken. Captured only if the campaign reaches its goal.",
    narration:
      "Here is the result in Your investments: reserved, not taken. Captured only if the campaign reaches its goal. Released if it doesn't. Every figure is labelled.",
    audio: "/demo/audio/13-crowdfunding-result.wav",
    durationMs: 12971,
    holdMs: 1100,
    focus: "crowdfunding-portfolio",
    callout: { eyebrow: "Your investments", title: "Reserved, not taken." },
    action: { surface: "crowdfunding", name: "addDemoPosition" },
  },
];

/** Height of the progress rail's steps, and the one place that knows the count. */
export const DEMO_STEP_COUNT = DEMO_STEPS.length;

/** Total scripted length, for the CTA ("about 2 minutes"). */
export const DEMO_TOTAL_MS = DEMO_STEPS.reduce(
  (total, step) => total + step.durationMs + step.holdMs,
  0
);

export function stepAt(index: number): DemoStep | null {
  if (!Number.isInteger(index) || index < 0 || index >= DEMO_STEPS.length) return null;
  return DEMO_STEPS[index];
}

/** 0 → 1, for the rail — clamped so the bar never reports more than finished. */
export function demoProgress(index: number): number {
  if (DEMO_STEPS.length <= 1) return 1;
  return Math.min(Math.max(index, 0), DEMO_STEPS.length - 1) / (DEMO_STEPS.length - 1);
}
