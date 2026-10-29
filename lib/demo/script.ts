// lib/demo/script.ts
//
// The kiosk: the sequence a judge watches when they press ▶ Demo.
//
// A recorded video would do half this job, but the point of the demo is that
// **the app is the demo** — every step below calls the same handler the
// buttons call, through the same `/api/agent` and `/api/holds` the product
// uses. Nothing here is a mock, and nothing here is narration that outlives
// what actually happened: if the server refuses, the judge sees the refusal.
//
// Three rules the script is written under, and each one has a test:
//
// 1. **It never moves money.** The last step stops in front of the PayPal
//    button. The demo prepares an order and stops where a human is required —
//    which is the thesis, not a limitation of the demo.
// 2. **It only names actions a surface actually exposes.** A step pointing at
//    a function that does not exist is a blank pause in front of a judge, so
//    the action names live here, next to the steps, and are checked.
// 3. **Every step is readable.** Captions are read by a person watching a
//    screen from a metre away, so each one carries a hold of at least a
//    second and a half after its action lands.

/** The only two screens the demo visits. Both are product, not appendices. */
export type DemoRoute = "/overview" | "/crowdfunding";

/** What the driver asks of the page it is currently on. */
export type DemoAction = {
  /** Which surface owns the function. */
  surface: DemoRoute;
  name: string;
  /** Intent text or amount, when the action needs one. */
  arg?: string | number;
};

export type DemoStep = {
  id: string;
  /** Where the step must run; the driver navigates first if it is elsewhere. */
  route: DemoRoute;
  /** What the judge reads while the step runs. English: the judges are. */
  caption: string;
  /** Reading time after the action lands. See rule 3 above. */
  holdMs: number;
  action?: DemoAction;
  /**
   * The step that hands control back. Exactly one exists, it is the last one,
   * and it is the reason this is a kiosk rather than a slideshow: the script
   * stops where a human is required and stays stopped.
   */
  handOff?: boolean;
};

/**
 * Actions the Overview page exposes to the driver.
 *
 * They are the page's own handlers, not a parallel implementation — see the
 * `handlersRef` in `AgentGrid`, which keeps them current across renders while
 * the registration itself stays stable.
 */
export const OVERVIEW_ACTIONS = [
  /** Put text in the intent box without submitting it (the "Use the example" button's job). */
  "fillIntent",
  /** Press Draft order for real: POST /api/agent, strip, card, console. */
  "draft",
  /** Choose a candidate from the strip — the human's call, done for them here. */
  "choose",
  /** Click an amount in Money in flight and open the order behind it. */
  "openFromFlight",
  /** Leave the page as it was found: panel closed, strip cleared. */
  "close",
] as const;

/** Actions the crowdfunding page exposes to the driver. */
export const CROWDFUNDING_ACTIONS = [
  /** Select a project on the map (the first one in the list). */
  "selectProject",
  /** Set the pledge amount — $20 is the floor, $50 the example. */
  "setAmount",
  /** Bring the PayPal button into view. It is never clicked; see `handOff`. */
  "revealPledge",
  /** Leave the page as it was found. */
  "close",
] as const;

/**
 * Action names that would move money if the script ever called them.
 *
 * The list is deliberately wider than what the current script uses: a future
 * step that "just tries the button" fails this test before it ships, because
 * the kiosk's promise is not "it does not capture today", it is "it does not
 * capture".
 */
export const MONEY_MOVING_ACTIONS = [
  "authorize",
  "capture",
  "pay",
  "fund",
  "pledge",
  "paypal",
  "checkout",
  "release",
  "confirm",
] as const;

/**
 * The script itself.
 *
 * Order matters and is the narrative: a request **without** an amount first,
 * so the gateway's question is seen before any search happens (the bug this
 * demo would have exposed on its first day), then the same kind of request
 * with a ceiling, then the choice, then the money it commits, and finally the
 * one screen where money grows — stopping at the button.
 */
export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: "intro",
    route: "/overview",
    caption:
      "Watch it work. The agent prepares — you approve — our server pays. This demo never moves money.",
    holdMs: 3600,
  },
  {
    id: "type-without-amount",
    route: "/overview",
    caption: "You say what you want, in your own words — and no amount yet.",
    holdMs: 2600,
    // English on purpose: the app answers in the language it is asked, and
    // the judges read English. The bilingual path is a feature of the product,
    // not something the walkthrough has to spend a beat proving.
    action: { surface: "/overview", name: "fillIntent", arg: "I need new running shoes" },
  },
  {
    id: "ask-for-the-ceiling",
    route: "/overview",
    caption:
      "It will not search until it knows what you can spend — so it asks. No catalog, no prices, nothing bought.",
    holdMs: 4200,
    action: { surface: "/overview", name: "draft", arg: "I need new running shoes" },
  },
  {
    id: "type-with-amount",
    route: "/overview",
    caption: "Now with a ceiling: the number that authorises the spend, said out loud.",
    holdMs: 2600,
    action: {
      surface: "/overview",
      name: "fillIntent",
      arg: "white sneakers, size 10, by Friday, only if the price drops to 60 USD or less",
    },
  },
  {
    id: "search-and-judge",
    route: "/overview",
    caption:
      "It searches the catalog and judges what came back — every candidate is shown, not just its favourite.",
    holdMs: 4200,
    action: {
      surface: "/overview",
      name: "draft",
      arg: "white sneakers, size 10, by Friday, only if the price drops to 60 USD or less",
    },
  },
  {
    id: "human-chooses",
    route: "/overview",
    caption:
      "You pick one. The order lands as Awaiting approval — nothing is live until a human authorizes it.",
    holdMs: 4200,
    action: { surface: "/overview", name: "choose" },
  },
  {
    id: "money-in-flight",
    route: "/overview",
    caption: "Every claim on your money is drawn here. Click any amount and the order behind it opens.",
    holdMs: 4200,
    action: { surface: "/overview", name: "openFromFlight" },
  },
  {
    // The crossing gets a beat of its own, on this side of it.
    //
    // This step used to be the one that navigated, which meant the screen
    // jumped the instant its caption appeared — the judge read "one screen
    // over" while the page was already tearing past, which is exactly the
    // violent cut this beat exists to avoid. So it stays on Overview for the
    // whole reading time, hands the page back (card, strip, ask), and the
    // *next* step is the one that crosses. At least three seconds of the
    // screen you are being told to leave, before you leave it.
    id: "before-the-crossing",
    route: "/overview",
    caption: "Same rules, one screen over: this is where money grows instead of leaving.",
    holdMs: 3400,
    action: { surface: "/overview", name: "close" },
  },
  {
    // The crossing itself: navigates, then picks. Its caption changes while
    // the navigation is in flight, so it is written to read on either screen.
    id: "pick-a-project",
    route: "/crowdfunding",
    caption: "Pick a real business — the map is the list.",
    holdMs: 3000,
    action: { surface: "/crowdfunding", name: "selectProject" },
  },
  {
    id: "pick-an-amount",
    route: "/crowdfunding",
    caption: "Choose what you can spare: $20 is the floor, and the ceiling is yours.",
    holdMs: 3000,
    action: { surface: "/crowdfunding", name: "setAmount", arg: 50 },
  },
  {
    id: "stop-before-the-button",
    route: "/crowdfunding",
    caption:
      "This is where it stops. The demo never moves money — the last click is yours. Press ✕ to look around.",
    holdMs: 6000,
    action: { surface: "/crowdfunding", name: "revealPledge" },
    handOff: true,
  },
];

/** The first step — where `startDemo()` puts the index. */
export const FIRST_STEP_INDEX = 0;

/** The last step's index, i.e. where the script stops rather than loops. */
export const LAST_STEP_INDEX = DEMO_STEPS.length - 1;

/** A step at `index`, clamped: past the end the script is finished. */
export function stepAt(index: number): DemoStep | null {
  if (index < 0 || index >= DEMO_STEPS.length) return null;
  return DEMO_STEPS[index];
}

/** 0 → 1 progress of `index`, for the bar the judge reads at a glance. */
export function demoProgress(index: number): number {
  if (DEMO_STEPS.length <= 1) return 1;
  const clamped = Math.min(Math.max(index, 0), LAST_STEP_INDEX);
  return clamped / LAST_STEP_INDEX;
}
