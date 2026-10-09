// lib/crowdfunding.ts
//
// What a project is, and what a payload has to prove before this product will
// show it as one.
//
// Phase 3's rule is the same one the rest of the app already follows: a record
// that cannot be read is refused, never repaired. A project with a goal but no
// coordinates would break the map; one whose `raised` exceeds its `goal` would
// show a bar past 100% and a "still missing" figure that is negative — both
// are failures a reader cannot detect, which is the reason they are refused
// here rather than clamped.
//
// Pure on purpose: no `fs`, no fetch, no side effects. The server entry reads
// the seed and passes validated projects down; the grid imports this module in
// the browser. A file system import in here would follow the grid into the
// client bundle — see the note on `allowImportingTsExtensions` in tsconfig.
//
// The seed lives in `lib/seeds/`, not in `data/`: `data/` is gitignored as
// runtime state, so anything written there is invisible to a clone — a demo
// whose showcase arrives empty on the judge's machine is a demo that never
// shipped. The two directories answer different questions — *what we ship*
// and *what happened while running* — and confusing them is how a repository
// ends up depending on a file it does not contain.

import { STATUS, type Verdict } from "./policy.ts";

/** How many projects the showcase will hold before it pages. */
export const MAX_PROJECTS = 50;

/** The minimum the model allows anyone to put in. One rule, one name. */
export const MIN_INVESTMENT_USD = 20;

/**
 * The ceiling on a single investment.
 *
 * $20 is the door and $1.000 is the wall: above it this stops being a product
 * for the person putting in twenty and starts being one for a handful of
 * larger tickets, which changes what the showcase has to promise. Enforced
 * here rather than in the input's `max`, because an attribute the user can
 * edit is a suggestion — the panel states it and the server-side judge of
 * F3.4 will refuse anything outside the band.
 */
export const MAX_INVESTMENT_USD = 1000;

/**
 * The commission the platform takes for arranging the funding.
 *
 * Stated as a number in code rather than as a line of copy, so the figure the
 * UI shows, the figure the server charges and the figure in the pitch are the
 * same one. Nothing is collected yet; the design says where it would come from.
 */
export const PLATFORM_FEE_PCT = 2;

/**
 * How a pledge names the campaign it funds inside a PayPal order.
 *
 * `customId` is the one field on an order PayPal carries untouched, and the
 * crowdfunding panel already writes `cf-<project id>` into it. Reading the
 * campaign back out of that single field — rather than trusting a second
 * `projectId` the request would have to add — means the order cannot say two
 * different things about what it funds.
 *
 * A prefix the browser chooses is not, by itself, proof of anything: what it
 * buys is the *opposite*. Naming a campaign is what puts an order under the
 * band and the goal; an order that names none stays an ordinary purchase
 * order, because a $5 coffee is a legitimate $5 coffee and only a stake has a
 * minimum.
 */
export const CROWDFUNDING_PREFIX = "cf-";

/**
 * The campaign an order funds, or `null` when it funds none.
 *
 * Returns `""` — not `null` — for `cf-` with nothing after it: an order that
 * announced a campaign and then named no id is a pledge this product cannot
 * judge, and reading that as "no campaign" would hand it the ordinary path.
 */
export function campaignIdFromCustomId(customId: unknown): string | null {
  if (typeof customId !== "string" || !customId.startsWith(CROWDFUNDING_PREFIX)) return null;
  return customId.slice(CROWDFUNDING_PREFIX.length).trim();
}

export type Risk = "A" | "B" | "C";

/**
 * Whether the goal has been reached — derived, never stored.
 *
 * A stored status is a second source of truth that drifts from `raised` the
 * first time a row is written by hand, and the two disagreeing is exactly the
 * kind of contradiction this project keeps removing.
 */
export type ProjectStatus = "OPEN" | "FUNDED";

export type Project = {
  /** Stable across renders: the row identity and the map pin share it. */
  id: string;
  name: string;
  /** "Chacao, Miranda" — shown, because proximity is the argument. */
  city: string;
  /** What the money is for, in the operator's own words. */
  what: string;
  /**
   * How long the campaign runs, in days from the day it is read.
   *
   * Stored relative rather than as a date so a shipped sample never expires on
   * the shelf: a hardcoded deadline turns the showcase closed a month after the
   * repo is published, and a closed showcase is a broken demo that looks
   * correct. The absolute date is derived at normalise time, exactly as the
   * sample purchase history dates its rows relative to first run.
   */
  runwayDays: number;
  /**
   * The last day money may be pledged — derived from `runwayDays` at read
   * time, never stored.
   *
   * The rule it carries is the fairness one: past this date the campaign is
   * over and anything pledged against it is released, because holding money
   * for a project that is not going to start is the one outcome this product
   * must never produce.
   */
  deadline: string;
  /** USD needed. Always positive. */
  goalUsd: number;
  /** USD committed so far. Never above `goalUsd` — see `normaliseProjects`. */
  raisedUsd: number;
  /** Annual return offered to the people who fund it, in percent. */
  returnPct: number;
  /** The committee's grade: A lower risk, C higher. */
  risk: Risk;
  /**
   * What stands behind the money — the collateral the design calls
   * "nivel de seguridad".
   *
   * A grade without a reason is a number the reader has to take on faith, and
   * "backed by the inventory in the store" is the sentence that answers the
   * first question anyone asks: *what happens if the business fails?* Required,
   * because a project whose backing is unknown is a project nobody should be
   * asked to fund — the UI never invents one to fill the cell.
   */
  collateral: string;
  /** Latitude in decimal degrees, inside Venezuela. */
  lat: number;
  /** Longitude in decimal degrees, inside Venezuela (west is negative). */
  lng: number;
  /** How many people are already in. Social proof, and the only count shown. */
  investors: number;
  /**
   * The PayPal account the funding is directed to — written into the order as
   * its payee, so the money is aimed at the business at the moment the order
   * is created rather than by anything that happens after.
   *
   * Required: a project nobody can pay is a project nobody can fund, and a
   * malformed address would only surface as an opaque refusal from PayPal.
   */
  payeeEmail: string;
  /**
   * True while the project is a demo record rather than an audited one.
   *
   * The showcase must never imply an audit that has not happened: every seed
   * carries this, and the UI renders it as a chip.
   */
  seed?: boolean;
};

/**
 * Venezuela, as a bounding box: the four projects we seed all sit inside it,
 * and a coordinate outside it is a typo in a field the map trusts.
 */
const VENEZUELA = { latMin: 0.5, latMax: 12.3, lngMin: -73.5, lngMax: -59.7 };

const RISKS: Risk[] = ["A", "B", "C"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Read a project list, or refuse it.
 *
 * `null` means "not a list of projects", not "an empty list" — the two are
 * different answers and a caller showing an empty shelf for a malformed file
 * would be telling the operator that nobody applied.
 *
 * `today` is a parameter so the derived deadline can be pinned by a test
 * rather than by the day the suite runs — the same reason `readExpiry` takes
 * one.
 */
export function normaliseProjects(value: unknown, today: Date = new Date()): Project[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_PROJECTS) return null;

  const projects: Project[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const raw = asRecord(entry);
    if (!raw) return null;

    const id = text(raw.id);
    const name = text(raw.name);
    const city = text(raw.city);
    const what = text(raw.what);
    const collateral = text(raw.collateral);
    const goalUsd = finite(raw.goalUsd);
    const raisedUsd = finite(raw.raisedUsd);
    const returnPct = finite(raw.returnPct);
    const lat = finite(raw.lat);
    const lng = finite(raw.lng);
    const investors = finite(raw.investors);
    const runwayDays = finite(raw.runwayDays);
    const payeeEmail = text(raw.payeeEmail);

    if (!id || !name || !city || !what || !collateral) return null;
    // A campaign without a closing date is a campaign that holds money for as
    // long as it likes, so the field is required rather than defaulted.
    if (runwayDays === null) return null;
    if (seen.has(id)) return null;
    if (goalUsd === null || goalUsd <= 0) return null;
    if (raisedUsd === null || raisedUsd < 0) return null;
    // Over-recruitment cannot exist. A row claiming $52.000 toward a $50.000
    // goal would render a full bar and a negative "still missing" figure, and
    // no reader would know which of the two numbers was the lie.
    if (raisedUsd > goalUsd) return null;
    if (returnPct === null || returnPct < 0 || returnPct >= 100) return null;
    if (lat === null || lng === null) return null;
    if (lat < VENEZUELA.latMin || lat > VENEZUELA.latMax) return null;
    if (lng < VENEZUELA.lngMin || lng > VENEZUELA.lngMax) return null;
    if (investors === null || investors < 0 || !Number.isInteger(investors)) return null;
    // The address PayPal will be asked to pay. Shape-checked here because a
    // typo only shows up as an opaque refusal at checkout, far from the field
    // that carried it.
    if (!payeeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payeeEmail)) return null;

    const risk = text(raw.risk)?.toUpperCase();
    if (!risk || !RISKS.includes(risk as Risk)) return null;
    if (raw.seed !== undefined && typeof raw.seed !== "boolean") return null;

    seen.add(id);
    projects.push({
      id,
      name,
      city,
      what,
      collateral,
      runwayDays,
      deadline: isoPlusDays(today, runwayDays),
      payeeEmail,
      goalUsd,
      raisedUsd,
      returnPct,
      risk: risk as Risk,
      lat,
      lng,
      investors,
      ...(typeof raw.seed === "boolean" ? { seed: raw.seed } : {}),
    });
  }

  return projects;
}

/** 0…1, clamped at the goal — a full bar is full, never overflowing. */
export function progressPct(project: Project): number {
  if (project.goalUsd <= 0) return 0;
  return Math.min(1, Math.max(0, project.raisedUsd / project.goalUsd));
}

/** What is still missing, never negative: 0 when the goal is met. */
export function remainingUsd(project: Project): number {
  return Math.max(0, project.goalUsd - project.raisedUsd);
}

/** Derived from the money, so the two can never disagree. */
export function statusOf(project: Project): ProjectStatus {
  return project.raisedUsd >= project.goalUsd ? "FUNDED" : "OPEN";
}

/**
 * What should happen to a reservation against this campaign.
 *
 * This is the rule the card promises in words — *"captured when the campaign
 * reaches its goal, and released if it does not close"* — moved into code,
 * because a promise printed above a button that the system does not perform is
 * the one thing this product cannot ship.
 *
 *   FUNDED            → capture: the goal is met, so the condition holding the
 *                       money is satisfied and it may settle
 *   past the deadline → release: the campaign missed, and holding money for a
 *                       project that will never start is the outcome this
 *                       product exists to prevent
 *   otherwise         → wait: the money stays set aside, which is what
 *                       "reserved, not taken" means
 *
 * It lives here rather than in the agent's pass because both the pass and the
 * pledge button have to agree: one rule, one definition, or the button captures
 * something the pass would have released.
 */
export type CampaignAction = "capture" | "release" | "wait";

export function campaignAction(project: Project, today: Date = new Date()): CampaignAction {
  if (statusOf(project) === "FUNDED") return "capture";
  if (daysLeft(project.deadline, today) < 0) return "release";
  return "wait";
}

// ─── Whether an investment may be made ─────────────────────────────────────

/** Dollars as the panel writes them: `$1,000`, `$7,500`, `$250.01`. */
function usd(value: number): string {
  // Rounded to cents first, then shown whole when it *is* whole: a refusal
  // that rounds "$250.01 missing" to "$250" hides the very cent it is about.
  const cents = Math.round(value * 100) / 100;
  const decimals = Number.isInteger(cents) ? 0 : 2;
  return cents.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Judge a pledge against the campaign it funds.
 *
 * Fase 1 applied to a second kind of money. The panel already states three
 * numbers — the band (`$20`–`$1,000`) and the goal — and until now the only
 * thing enforcing any of them was an attribute on an input the user can edit.
 * A promise printed beside a button the server does not keep is the one thing
 * this product cannot ship, so the server judges the campaign the order names
 * and answers **409** with the sentence the panel would have said.
 *
 * Four rules, all of them the campaign's own numbers:
 *
 *   band    below `$20` this is not the product it claims to be; above
 *           `$1,000` it stops being one for the person putting in twenty.
 *   goal    `raised + amount` may never pass `goal`. Not clamped: a pledge
 *           that silently fills past the bar is the same failure as a seed row
 *           whose `raised` exceeds its `goal`, which this module refuses.
 *   state   a campaign past its deadline is over — the window says the same
 *           thing about the envelope, and two rules that agree are the point.
 *   number  an amount that is not money cannot be judged against any of them.
 *
 * Every violation is returned, not the first: a caller who only hears about
 * the amount fixes the amount and re-runs straight into the goal.
 *
 * The figures come from the project the *server* holds. The request only says
 * which campaign it funds; it does not get to say what that campaign's goal
 * is, which is the difference between judging a catalogue and repeating one.
 *
 * `today` exists so a test can pin the deadline edge without waiting for
 * midnight; every caller outside the tests leaves it out.
 */
export function judgeInvestment(
  amountUsd: number,
  project: Project,
  today: Date = new Date()
): Verdict {
  const violations: string[] = [];
  const countable = Number.isFinite(amountUsd) && amountUsd > 0;

  if (!countable) {
    violations.push(
      `No amount was given — an investment has to be a number between $${MIN_INVESTMENT_USD} and $${MAX_INVESTMENT_USD.toLocaleString(
        "en-US"
      )}.`
    );
  } else {
    if (amountUsd < MIN_INVESTMENT_USD) {
      violations.push(`The minimum is $${MIN_INVESTMENT_USD}.`);
    }
    if (amountUsd > MAX_INVESTMENT_USD) {
      violations.push(
        `The maximum in one go is $${MAX_INVESTMENT_USD.toLocaleString("en-US")}.`
      );
    }

    // The goal, against what is still missing. `remainingUsd` never goes
    // negative, so a campaign already at its goal reports zero missing and
    // refuses — which is the same answer `raised > goal` gets from
    // `normaliseProjects`, asked of an order instead of of a file.
    const missing = remainingUsd(project);
    if (amountUsd > missing) {
      violations.push(
        missing <= 0
          ? `${project.name} has already reached its ${usd(project.goalUsd)} goal, so it is not taking more.`
          : `Only ${usd(missing)} is missing at ${project.name} against its ${usd(
              project.goalUsd
            )} goal — ${usd(amountUsd)} would take it to ${usd(project.raisedUsd + amountUsd)}.`
      );
    }
  }

  if (daysLeft(project.deadline, today) < 0) {
    violations.push(
      `The campaign closed on ${project.deadline}: nothing new can be pledged against it.`
    );
  }

  const allowed = violations.length === 0;

  return {
    allowed,
    violations,
    reason: allowed
      ? `${usd(amountUsd)} is inside the band and fits the ${usd(project.goalUsd)} goal of ${project.name}.`
      : violations.join(" "),
  };
}

/**
 * Why an investment may not settle right now — or `null` when it may.
 *
 * The sentence the card printed above the button (*"captured when the campaign
 * reaches its goal, and released if it does not close"*) is only true if the
 * server says it too: the Protection column offers Capture on any `Reserved`
 * row, and without this rule a pledge for a campaign still twenty days from
 * closing takes money the campaign never earned.
 *
 * `project` may be `null`, meaning the campaign is gone from the showcase. An
 * order whose campaign cannot be found has nothing left to settle against, and
 * the answer has to say so rather than fall through to the generic condition
 * path — which reads an investment's empty condition as *spend now*.
 *
 * Lives here, next to `campaignAction`, for the same reason `agentCharge` does
 * not live inside a route: routes are not tested, so a rule written in one
 * can be changed without a single assertion noticing.
 */
export function settlementRefusal(
  what: string,
  project: Project | null,
  today: Date = new Date()
): string | null {
  if (!project) {
    return `The project behind "${what}" is not in the showcase any more, so nothing can settle it.`;
  }

  const action = campaignAction(project, today);
  if (action === "capture") return null;
  if (action === "release") {
    return `"${what}" cannot be captured: the campaign closed on ${project.deadline} without reaching its goal, so the pledge is released, not taken.`;
  }

  const left = daysLeft(project.deadline, today);
  return `"${what}" stays reserved: the campaign has not reached its goal and closes ${
    project.deadline
  } — ${left} day${left === 1 ? "" : "s"} left. It is captured when the goal is met, and released if it is not.`;
}

/** A `Date` as the calendar on this machine reads it: YYYY-MM-DD. */
function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `from + days` as YYYY-MM-DD, on the calendar `readExpiry` compares against. */
function isoPlusDays(from: Date, days: number): string {
  return isoOf(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
}

/**
 * Days until a deadline: 0 is today, negative is a day already gone.
 *
 * Both sides are YYYY-MM-DD, so the arithmetic runs on calendar parts. A
 * timestamp difference would count hours and report "1 day left" for a
 * deadline that passed this morning, depending on when the page loaded.
 */
export function daysLeft(deadline: string, today: Date = new Date()): number {
  const [year, month, day] = deadline.split("-").map(Number);
  if (!year || !month || !day) return Number.NaN;
  const target = Date.UTC(year, month - 1, day);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86_400_000);
}

// ─── What a position earns ─────────────────────────────────────────────────

/**
 * Whether a position accrues.
 *
 * `Reserved` and `Captured` — the two states in which PayPal is actually
 * holding this money for the campaign. `Awaiting approval` holds nothing yet,
 * `Active` is a standing allowance that reserves nothing by design, and
 * `Released` is the one to exclude hardest: the money came back, so a card
 * still accruing on it would be reporting earnings on a refund.
 *
 * Said once, here, rather than decided by a filter in the component — the
 * count and the total have to come from the same answer.
 */
export function earnsDividend(row: { status: string }): boolean {
  return row.status === STATUS.reserved || row.status === STATUS.captured;
}

export type Dividend = {
  /** Whole days the position has been earning — 0 before it starts. */
  days: number;
  /** `amount × returnPct/100 / 365`, in dollars. */
  perDay: number;
  /** `perDay × days`: promised, not paid. The note under the card says so. */
  total: number;
};

/**
 * The dividend, in three figures, never one.
 *
 * `(amount × rendimiento/100 / 365) × días` — the operator's own formula,
 * held here so the figure in the card, the figure in a row and the figure in
 * a test are the same one. A rate typed into a component is how 14% becomes
 * 14% a month on one screen and 14% a year on another.
 *
 * `since` is the moment PayPal set the money aside, read as a **calendar day
 * on this machine** and counted with the same arithmetic as the campaign's
 * window (`daysLeft`). A raw timestamp difference would credit a pledge made
 * at 23:00 with a day it did not have — and would disagree with the window
 * about which day today is.
 *
 * No clock inside. The figure changes when the day changes; a component
 * ticking every second would redraw a number that moves once a day, which is
 * motion that means nothing.
 *
 * Unknown start, missing return and non-positive amounts all answer zero,
 * never a guess: an accrued figure is a promise about money, and the honest
 * default for a position whose start cannot be read is that none of it counts.
 */
export function dividendOn(
  position: { amountUsd: number; returnPct: number; since?: string | null },
  today: Date = new Date()
): Dividend {
  const amount =
    Number.isFinite(position.amountUsd) && position.amountUsd > 0 ? position.amountUsd : 0;
  const rate =
    Number.isFinite(position.returnPct) && position.returnPct > 0 ? position.returnPct : 0;

  const perDay = (amount * rate) / 100 / 365;
  const days = daysSince(position.since, today);
  return { days, perDay, total: perDay * days };
}

/** Whole days from a stored timestamp to `today`, never negative. */
function daysSince(since: string | null | undefined, today: Date): number {
  if (!since) return 0;
  const started = new Date(since);
  if (Number.isNaN(started.getTime())) return 0;
  // `daysLeft` counts *forward to* a deadline, so a start behind us is its
  // negation — and a start ahead of us lands negative, which clamps to zero
  // below rather than becoming debt.
  const days = -daysLeft(isoOf(started), today);
  return days > 0 ? days : 0;
}
