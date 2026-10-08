// lib/policy.ts
// Single source of truth for the status, action and mode strings that flow
// between the API routes (server) and the AG Grid UI (client).
//
// These values are written into grid cells and compared with `===`, so keeping
// them in one place prevents the classic "the row says X but the renderer
// looks for Y" bug. The transition rules live here too, so the server and the
// button that offers an action can never disagree about what is legal — and
// so does the judgement of whether a charge is permitted, for the same reason:
// a rule only earns trust if one place defines it and everything else asks.
//
// Copy rule: these are read by a person under time pressure. They say the
// state and the next action in plain words — never internal machinery
// ("enforcement", "kernel", "gateway") in a label the user has to decode.

/** Lifecycle of a spend policy, shown in the Protection column. */
export const STATUS = {
  /** Drafted but not yet approved — nothing is held and nothing can spend. */
  pending: "Awaiting approval",
  /**
   * A purchase order whose ceiling was authorized: the money is set aside
   * against this order and cannot be spent elsewhere, but it has not moved.
   * It leaves this state when the condition is settled — captured or released.
   */
  reserved: "Reserved",
  /** The hold was settled — the funds actually moved. Terminal. */
  captured: "Captured",
  /** The hold was cancelled before settlement — the funds are back. Terminal. */
  released: "Released",
  /**
   * A standing allowance, approved and enforced. Distinct from a hold on
   * purpose: a subscription does not reserve its own money every month, it
   * simply may not be spent beyond the ceiling.
   */
  enforced: "Active",
  /** FX shield is actively guarding the balance. */
  protecting: "Protecting",
} as const;

/** The three things a human can do to a policy from the Protection column. */
export type HoldAction = "activate" | "capture" | "release";

/** Narrowing helper: true when a value is a known action. */
export function isHoldAction(value: unknown): value is HoldAction {
  return value === "activate" || value === "capture" || value === "release";
}

/**
 * Which status each action is legal from.
 *
 * Keeping this here rather than inside the renderer means the button simply
 * cannot offer an action the transition would reject — a disabled control the
 * user can reason about beats an error they have to recover from.
 */
const LEGAL_FROM: Record<HoldAction, readonly string[]> = {
  activate: [STATUS.pending],
  capture: [STATUS.reserved],
  release: [STATUS.reserved],
};

/** Narrowing helper: true when a value is a known status. */
export function isStatus(value: unknown): value is string {
  return (
    value === STATUS.enforced ||
    value === STATUS.pending ||
    value === STATUS.protecting ||
    value === STATUS.reserved ||
    value === STATUS.captured ||
    value === STATUS.released
  );
}

/** True when `action` may be performed on a policy currently in `status`. */
export function canPerform(action: HoldAction, status: string): boolean {
  return LEGAL_FROM[action].includes(status);
}

/**
 * Where `activate` lands.
 *
 * A policy carrying a condition becomes a held purchase order — the money has
 * to be set aside first, because the whole point is that it only moves when
 * the condition says so. A policy with no condition is a standing allowance
 * and does not need to hold anything before it may spend.
 */
export function statusAfterActivate(condition: string): string {
  return condition.trim() ? STATUS.reserved : STATUS.enforced;
}

// ─── Whether a charge may happen ───────────────────────────────────────────

/** Statuses under which a charge against this policy may be attempted at all. */
const SPENDABLE_STATUSES: readonly string[] = [STATUS.enforced, STATUS.reserved];

/**
 * An attempted charge.
 *
 * `endpoint` and `payee` are optional because attempts written before either
 * rule existed carry neither, and a rule must not start rejecting payloads
 * that were valid the day before it shipped.
 */
export type ChargeAttempt = {
  amount: number;
  currency: string;
  /** Host the charge is aimed at. Empty when the attempt names none. */
  endpoint?: string;
  /** Account the charge pays. Empty when the attempt names none. */
  payee?: string;
  /**
   * Who set this charge in motion — the attempt's half of the autonomy rule.
   *
   * Optional because attempts written before this field existed carry none.
   * On a Copilot order that absence is refused rather than forgiven: a mode
   * that exists to require a human cannot read "does not say" as "there was
   * one". See rule 5 of the scope.
   */
  initiatedBy?: "human" | "agent";
};

/** The envelope an order was approved inside. */
export type PolicyEnvelope = {
  limit: number;
  currency: string;
  /** The only host this order may reach. Empty when no merchant was named. */
  allowEndpoint?: string;
  /** The only account this order may pay. Empty when no recipient was named. */
  payee?: string;
  what: string;
  status: string;
  /**
   * Last day this order may be used, as YYYY-MM-DD.
   *
   * Empty means the approver let it run indefinitely — a decision, not an
   * omission. Non-empty is judged by `readExpiry`, including when it is not a
   * date at all.
   */
  expires?: string;
  /**
   * The autonomy the approver granted.
   *
   * Absent on envelopes written before the column existed, and an absent mode
   * is not a Copilot mode — the same reading an empty allow-list gets: what is
   * not there does not restrict.
   */
  mode?: string;
};

export type Verdict = {
  allowed: boolean;
  /** Every reason the charge was refused, not only the first. */
  violations: string[];
  reason: string;
};

// ─── The window an order may be used in ────────────────────────────────────

/** A date, the way the grid cell and the model both write it. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar day at `now`, as YYYY-MM-DD, on the clock where this runs.
 *
 * Exported because two places have to agree on what "today" means: the judge
 * reading an order's window, and the evaluator reading a scheduled condition.
 * Two notions of the day is how one of them says an order is live while the
 * other says it is expired.
 *
 * Local rather than UTC on purpose: a bare date in a cell carries no
 * timezone, so the only self-consistent reading is the day the machine holding
 * the clock agrees on. `now` is a parameter so a boundary can be pinned by a
 * test instead of by waiting for one.
 */
export function calendarDay(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** What an order's `Valid until` cell actually says. */
export type ExpiryWindow =
  /** Empty — the approver let this order run indefinitely. */
  | { kind: "none" }
  /** A date, with whether the day it names has already passed. */
  | { kind: "date"; iso: string; expired: boolean }
  /** Something in the cell that is not a date, so no window can be judged. */
  | { kind: "unreadable"; raw: string };

/**
 * Read an order's `Valid until` cell.
 *
 * Three readings, never two. An empty cell is an order approved to run
 * indefinitely. A date is a window that either has days left or does not.
 * Anything else is a date nobody can read — and that third case must never
 * collapse into the first, because "I cannot tell when this ends" is not the
 * same as "this never ends". It is the rule the condition evaluator already
 * follows: what cannot be judged is never read as what is permitted.
 *
 * The day comes from the clock where this runs. A bare cell carries no
 * timezone, so the only self-consistent reading is the one the machine
 * holding the clock agrees on; a cell that named its timezone would be
 * better, and belongs with the rest of the schema work.
 *
 * `today` is a parameter so a boundary can be pinned by a test rather than
 * by waiting for midnight.
 */
export function readExpiry(raw: string | undefined | null, today: Date = new Date()): ExpiryWindow {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "none" };
  // Shaped like a date and actually being one are different questions.
  // `2026-02-30` matches the pattern and names no day; comparing it
  // lexicographically would treat a date that never happened as a window
  // still open, which is the same mistake as reading a phrase as "no
  // expiry" — only quieter.
  if (!ISO_DATE.test(text)) return { kind: "unreadable", raw: text };
  if (!isCalendarDate(text)) return { kind: "unreadable", raw: text };
  // Both sides are YYYY-MM-DD, where lexicographic and chronological order
  // agree — so the comparison needs no parsing and no timezone.
  return { kind: "date", iso: text, expired: calendarDay(today) > text };
}

/** True when `iso` names a day that exists: `2026-02-30` does not. */
function isCalendarDate(iso: string): boolean {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

// ─── Reading a deadline a human wrote ──────────────────────────────────────

/**
 * The next occurrence of a weekday, today or later.
 *
 * "by Friday" said on a Friday means *today*: a deadline never points at a
 * day that has already gone, and rolling forward a week instead would quietly
 * extend an authority the approver meant to end now.
 */
function nextWeekday(from: Date, target: number): Date {
  const days = (target - from.getDay() + 7) % 7;
  return addDays(from, days);
}

/** The next day-of-month that exists and has not passed. */
function nextDayOfMonth(from: Date, day: number): Date {
  for (let offset = 0; offset < 5; offset++) {
    const candidate = new Date(from.getFullYear(), from.getMonth() + offset, day);
    // `new Date(y, m, 31)` in a 30-day month rolls into the next one, so the
    // day that comes back has to be the day that was asked for.
    if (candidate.getDate() === day && candidate >= startOfDay(from)) return candidate;
  }
  return from;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isoFrom(date: Date): string {
  return calendarDay(date);
}

/** Weekday names, in the two languages this router answers to. */
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, domingo: 0,
  monday: 1, mon: 1, lunes: 1,
  tuesday: 2, tue: 2, martes: 2,
  wednesday: 3, wed: 3, miercoles: 3, "miércoles": 3,
  thursday: 4, thu: 4, thur: 4, jueves: 4,
  friday: 5, fri: 5, viernes: 5,
  saturday: 6, sat: 6, sabado: 6, "sábado": 6,
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, enero: 1,
  february: 2, feb: 2, febrero: 2,
  march: 3, mar: 3, marzo: 3,
  april: 4, abr: 4, abril: 4,
  may: 5, mayo: 5,
  june: 6, jun: 6, junio: 6,
  july: 7, jul: 7, julio: 7,
  august: 8, ago: 8, agosto: 8,
  september: 9, sep: 9, sept: 9, septiembre: 9,
  october: 10, oct: 10, octubre: 10,
  november: 11, nov: 11, noviembre: 11,
  december: 12, dic: 12, diciembre: 12,
};

/**
 * Turn whatever a deadline came back as into a date — or leave it alone.
 *
 * This exists because the field had a silent failure with a wide blast
 * radius: `asIsoDate` read an unreadable phrase as `""`, and `""` means *this
 * order never expires*. A model answering "Friday" instead of "2026-10-09"
 * therefore widened the authority it was asked to bound, and nothing between
 * the model and the grid could tell — the cell simply said "No expiry", which
 * reads as a fact.
 *
 * So the rule here is the one `readExpiry` already states, applied one step
 * earlier: **what cannot be read is returned as it arrived, never as empty.**
 * An unresolvable phrase reaches the judge as `unreadable` and the charge is
 * refused with a message a person can act on — one blocked payment beats an
 * authority nobody knew had grown.
 *
 * Resolved: an ISO date (padded if the day is single-digit), the relative
 * words a person actually writes — weekdays in English and Spanish, "next
 * week", "tomorrow", "end of the month", "in 3 days" — a day of the month
 * ("the 27th", "el 27"), and a month with a day ("December 31").
 *
 * `today` is a parameter so every branch can be pinned by a test rather than
 * by the day the suite happens to run.
 */
export function resolveExpiry(
  raw: string | undefined | null,
  today: Date = new Date()
): string {
  const text = (raw ?? "").trim();
  if (!text) return "";

  // Already the shape every reader wants. Padding first: `2026-10-9` is the
  // same day written by something that does not zero-fill, and a cell that
  // read it as unreadable would block a real deadline over one character.
  const short = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (short) {
    const [, year, month, day] = short;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const lower = text.toLowerCase();

  // 1. Words anchored on today.
  if (/\b(tomorrow|ma[nñ]ana)\b/.test(lower)) return isoFrom(addDays(today, 1));
  if (/\b(today|hoy)\b/.test(lower)) return isoFrom(today);
  if (/\b(next\s+week|la\s+semana\s+que\s+viene|semana\s+que\s+viene|pr[oó]xima\s+semana)\b/.test(lower)) {
    return isoFrom(addDays(today, 7));
  }
  if (/\b(end\s+of\s+(the\s+)?month|fin\s+de\s+mes|final\s+del\s+mes)\b/.test(lower)) {
    return isoFrom(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  }

  // 2. A count: "in 3 days", "en 2 semanas".
  const count = lower.match(
    /\b(?:in|en)\s+(\d{1,3})\s+(days?|dias?|d[ií]as?|weeks?|semanas?)\b/
  );
  if (count) {
    const amount = Number(count[1]);
    const weeks = /week|semana/.test(count[2]);
    return isoFrom(addDays(today, weeks ? amount * 7 : amount));
  }

  // 3. A weekday — the next one, today included.
  const weekday = Object.keys(WEEKDAYS).find((name) =>
    new RegExp(`\\b${name}\\b`).test(lower)
  );
  if (weekday) return isoFrom(nextWeekday(today, WEEKDAYS[weekday]));

  // 4. A day of the month: "the 27th", "el 27". Written on the 30th, it means
  //    next month's — a deadline the calendar has not reached yet.
  const dayOfMonth =
    lower.match(/\bthe\s+(\d{1,2})(?:st|nd|rd|th)?\b/) ??
    lower.match(/\bel\s+(\d{1,2})\b/) ??
    lower.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (dayOfMonth) {
    const day = Number(dayOfMonth[1]);
    if (day >= 1 && day <= 31) return isoFrom(nextDayOfMonth(today, day));
  }

  // 5. A month with a day: "December 31", "31 de diciembre". Taken as written
  //    rather than rolled forward — a date that has passed should read as
  //    passed, not be extended into a year nobody asked for.
  const monthFirst = lower.match(
    /\b(january|jan|enero|february|feb|febrero|march|mar|marzo|april|abr|abril|may|mayo|june|jun|junio|july|jul|julio|august|ago|agosto|september|sep|sept|septiembre|october|oct|octubre|november|nov|noviembre|december|dic|diciembre)\s+(\d{1,2})\b/
  );
  const dayFirst = lower.match(
    /\b(\d{1,2})\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/
  );
  if (monthFirst || dayFirst) {
    const month = monthFirst ? MONTHS[monthFirst[1]] : monthIndexOf(lower);
    const day = monthFirst ? Number(monthFirst[2]) : Number(dayFirst?.[1]);
    if (month && day >= 1 && day <= 31) {
      const candidate = new Date(today.getFullYear(), month - 1, day);
      if (candidate.getDate() === day) return isoFrom(candidate);
    }
  }

  // 6. Anything else JavaScript reads as a date, provided it looks like one:
  //    a bare "27" parses as a year, and taking it would be inventing.
  if (/[a-z]/i.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return isoFrom(parsed);
  }

  // Not a date — returned as it arrived so the judge can refuse the charge
  // and say why. This is the whole reason the function exists.
  return text;
}

/** Month index for a Spanish "31 de octubre" — the keys above are mixed. */
function monthIndexOf(lower: string): number | undefined {
  return Object.entries(MONTHS).find(([name]) => new RegExp(`\\b${name}\\b`).test(lower))?.[1];
}

/**
 * The envelope's own rules: what this order permits.
 *
 * Split out from the two questions about whether it may be *used*, because
 * those two disagree about status and agree about everything else: a charge
 * may only happen against an order that is armed, a hold may only be opened
 * against one that is not, and both answer to the same ceiling, the same
 * destinations, the same window and the same autonomy. One copy of each rule,
 * called from both, so a rule cannot be written twice and drift.
 */
function judgeScope(charge: ChargeAttempt, policy: PolicyEnvelope, today: Date): string[] {
  const violations: string[] = [];
  const endpoint = charge.endpoint ?? "";
  const chargePayee = charge.payee ?? "";
  const allowEndpoint = policy.allowEndpoint ?? "";
  const payee = policy.payee ?? "";

  // 1. The ceiling.
  if (charge.currency !== policy.currency) {
    violations.push(
      `Currency mismatch: the charge is in ${charge.currency} but the ceiling is in ${policy.currency}.`
    );
  } else if (charge.amount > policy.limit) {
    violations.push(
      `Amount ${charge.amount.toFixed(2)} ${charge.currency} exceeds the ${policy.limit.toFixed(2)} ${policy.currency} ceiling.`
    );
  }

  // 2. The destination. An empty allow-list means no merchant was named and
  //    therefore nothing is restricted — stated plainly rather than implied.
  if (allowEndpoint && endpoint && endpoint !== allowEndpoint) {
    violations.push(
      `Endpoint ${endpoint} is not allowed for this order (only ${allowEndpoint}).`
    );
  }

  // 3. The recipient. Deliberately stricter than rule 2, and the reason is
  //    worth stating because the two rules look alike: an endpoint may be
  //    absent because it is derived from a merchant the order never named, so
  //    requiring the pair costs nothing there. A payee is different — if the
  //    operator named one, then "the money can only land where you said it
  //    would" is the entire content of that field, and an attempt that reaches
  //    here without saying where it is going is precisely the one to stop. So
  //    this rule stands on `policy.payee` alone.
  if (payee && chargePayee !== payee) {
    violations.push(
      chargePayee
        ? `Recipient ${chargePayee} is not allowed for this order (only ${payee}).`
        : `This order may only pay ${payee}, and the attempt named no recipient.`
    );
  }

  // 4. The window. The column already said "Valid until"; this is where that
  //    date stops being a caption. An unreadable one is refused rather than
  //    read as no expiry, for the reason written on `readExpiry`.
  const window = readExpiry(policy.expires, today);
  if (window.kind === "date" && window.expired) {
    violations.push(
      `This order passed its valid-until date of ${window.iso}, so nothing may be spent against it.`
    );
  } else if (window.kind === "unreadable") {
    violations.push(
      `The valid-until date "${window.raw}" is not a date, so the window cannot be judged. Set it to YYYY-MM-DD or leave it empty.`
    );
  }

  // 5. The autonomy. Copilot means the agent may not act alone, so the charge
  //    has to show a human behind it. An attempt naming the agent is refused
  //    outright; one naming nobody is refused too, because a mode that exists
  //    to require a human cannot read silence as one. An Autonomous order
  //    takes either answer — that is what the approver granted it.
  if (policy.mode === MODE.copilot && charge.initiatedBy !== "human") {
    violations.push(
      charge.initiatedBy === "agent"
        ? `This order runs in Copilot mode, so a human has to approve each charge — this one was started by the agent.`
        : `This order runs in Copilot mode, so a human has to approve each charge — and this attempt does not say that one did.`
    );
  }

  return violations;
}

/**
 * The charge the agent declares when it acts on an order.
 *
 * A function rather than an object literal in the route, because the
 * declaration *is* the whole point of the autonomy rule: the pass has to say
 * who it is, and an inline object is exactly where `initiatedBy` would be
 * dropped in a refactor — leaving a Copilot order silently capturable by the
 * very thing its mode exists to stop, with no test to notice. Named here, it
 * can be pinned, and it is.
 */
export function agentCharge(policy: {
  limit: number;
  currency: string;
  allowEndpoint?: string;
  payee?: string;
}): ChargeAttempt {
  return {
    // The capture takes the whole reservation, so the charge is the ceiling
    // itself: the figure that can still break it is the catalog price, which
    // the pass checks separately against a fresh read.
    amount: policy.limit,
    currency: policy.currency,
    endpoint: policy.allowEndpoint ?? "",
    payee: policy.payee ?? "",
    initiatedBy: "agent",
  };
}

/**
 * Judge an attempted charge against a policy.
 *
 * Every violation is reported rather than the first, because an approver who
 * only hears about the amount will fix the amount and re-run straight into
 * the destination rules.
 *
 * Deliberately does not evaluate price conditions — settling a condition is
 * the hold's job. Keeping the two apart means neither has to know whether
 * the other has run.
 *
 * `today` exists so a test can pin the edge of the window without waiting for
 * midnight; every caller outside the tests leaves it out.
 */
export function judgeCharge(
  charge: ChargeAttempt,
  policy: PolicyEnvelope,
  today: Date = new Date()
): Verdict {
  const violations: string[] = [];

  // 1. Is the policy even armed? Nothing under draft or already settled may
  //    be charged, and the reason has to say so rather than failing vaguely.
  if (!SPENDABLE_STATUSES.includes(policy.status)) {
    violations.push(
      policy.status === STATUS.pending
        ? `The policy for "${policy.what}" has not been activated yet.`
        : `The policy for "${policy.what}" is ${policy.status}, so it no longer permits charges.`
    );
  }

  violations.push(...judgeScope(charge, policy, today));

  const allowed = violations.length === 0;

  return {
    allowed,
    violations,
    reason: allowed
      ? `Charge of ${charge.amount.toFixed(2)} ${charge.currency} is within "${policy.what}".`
      : violations.join(" "),
  };
}

/**
 * Judge a request to open a hold — the approval card asking PayPal to reserve
 * a ceiling on an order nobody has approved yet.
 *
 * The mirror of `judgeCharge` on exactly one point: a charge may only happen
 * against an order that is already armed, while a hold may only be opened
 * against one still awaiting approval, because opening the hold is what arms
 * it. Everything else is judged identically in both directions — an order
 * refused as a spend must not be opened as a reservation either, or the
 * window, the ceiling and the recipient would only start applying after the
 * money was already committed.
 */
export function judgeHoldRequest(
  charge: ChargeAttempt,
  policy: PolicyEnvelope,
  today: Date = new Date()
): Verdict {
  const violations: string[] = [];

  if (policy.status !== STATUS.pending) {
    violations.push(
      `A hold can only be opened against an order awaiting approval — this one is ${policy.status}.`
    );
  }

  violations.push(...judgeScope(charge, policy, today));

  const allowed = violations.length === 0;

  return {
    allowed,
    violations,
    reason: allowed
      ? `Order of ${charge.amount.toFixed(2)} ${charge.currency} is within "${policy.what}".`
      : violations.join(" "),
  };
}

/**
 * How much of a ceiling the current price is using.
 *
 * The display counterpart of the ceiling rule in `judgeScope`: that one
 * answers "may this amount pass", this one answers "how full is it" — same
 * ceiling, different question, one file, so the two cannot drift.
 *
 * Three bands, at thresholds that mean something rather than at round numbers:
 * under 70% there is room, 70-100% is close enough to look at, past the
 * ceiling it cannot fill at all.
 *
 * `band: "none"` is not a fourth band so much as an honest refusal to draw
 * one: no price, or no ceiling worth dividing by, means there is nothing to
 * measure. A short bar where the catalog returned nothing would be inventing
 * a figure the row does not have — the same rule that keeps an unverifiable
 * condition from reading as satisfied.
 */
export type CeilingUsage = {
  /** Price against the ceiling, capped at 1 for drawing. Null when unmeasurable. */
  ratio: number | null;
  /** True when the price passes the ceiling. */
  over: boolean;
  band: "none" | "low" | "near" | "over";
};

export function ceilingUsage(limit: number, price: number | null | undefined): CeilingUsage {
  const usable = Number.isFinite(limit) && limit > 0;
  const known = typeof price === "number" && Number.isFinite(price);
  if (!usable || !known) return { ratio: null, over: false, band: "none" };

  const over = price! > limit;
  return {
    // Capped so a price three times the ceiling does not run off the cell:
    // the words carry "exceeded", not the bar's length.
    ratio: Math.min(price! / limit, 1),
    over,
    band: over ? "over" : price! / limit >= 0.7 ? "near" : "low",
  };
}


/**
 * The terms a seller publishes, and the payment offered against them.
 *
 * The finding worth stating before the function: **an offer is judged by the
 * same rules a buyer's charge is.** Window, mode, destination, currency,
 * whether the order is armed — none of that is specific to which side of a
 * trade you are on, which is why this does not re-implement any of it. It asks
 * `judgeCharge` about all of it and adds the one rule that does not transfer.
 *
 * That rule is the amount, and it is the mirror image. A buyer refuses *above*
 * a ceiling and never below it — paying less is not a violation of their own
 * limit. A seller refuses anything that is not the price, in both directions:
 * underpayment is theft and overpayment is a mistake, and an agent that
 * settles a listing for a figure nobody agreed to has done something wrong
 * either way.
 *
 * So `price` is asked of the judge as a `limit`, where it does double duty as
 * the ceiling — an offer above it is refused there, with that rule's own
 * wording — and the floor is stated here, in the seller's words.
 */
export type OfferTerms = {
  what: string;
  /** The price. Both bounds: the offer must match it. */
  price: number;
  currency: string;
  /** Only these buyers may pay. Empty means any. */
  buyer?: string;
  /** Only this storefront may be paid through. Empty means any. */
  allowEndpoint?: string;
  /** The terms' own state. Nothing is accepted against a draft. */
  status: string;
  expires?: string;
  mode?: string;
};

/** A payment arriving at a seller. */
export type Offer = {
  amount: number;
  currency: string;
  buyer?: string;
  endpoint?: string;
  /** Declared, never assumed — see the autonomy rule in `judgeCharge`. */
  initiatedBy?: "human" | "agent";
};

/**
 * Judge an incoming payment against the terms its seller published.
 *
 * Returns the same `Verdict` a charge does, so a caller cannot tell which side
 * it asked about — which is the point: a counterparty checking an offer and a
 * buyer checking a charge are one question with two seats.
 */
export function judgeOffer(offer: Offer, terms: OfferTerms, today: Date = new Date()): Verdict {
  const shared = judgeCharge(
    {
      amount: offer.amount,
      currency: offer.currency,
      endpoint: offer.endpoint,
      payee: offer.buyer,
      initiatedBy: offer.initiatedBy,
    },
    {
      limit: terms.price,
      currency: terms.currency,
      allowEndpoint: terms.allowEndpoint,
      payee: terms.buyer,
      what: terms.what,
      status: terms.status,
      expires: terms.expires,
      mode: terms.mode,
    },
    today
  );

  const violations = [...shared.violations];

  // The floor. Above it, the shared ceiling rule has already spoken and with
  // the better wording for that side of it.
  if (offer.currency === terms.currency && offer.amount < terms.price) {
    violations.push(
      `The price of "${terms.what}" is ${terms.price.toFixed(2)} ${terms.currency}, and the offer is ${offer.amount.toFixed(2)} ${offer.currency}.`
    );
  }

  const allowed = violations.length === 0;
  return {
    allowed,
    violations,
    reason: allowed
      ? `Offer of ${offer.amount.toFixed(2)} ${offer.currency} matches "${terms.what}".`
      : violations.join(" "),
  };
}


/** Autonomy level granted to the agent for a given policy. */
export const MODE = {
  /** Agent may execute on its own within the limit. */
  autonomous: "Autonomous",
  /** Agent must ask a human before executing. */
  copilot: "Copilot",
} as const;

/** All modes in the order shown by the AG Grid select editor. */
export const MODE_OPTIONS: string[] = [MODE.autonomous, MODE.copilot];

/** Narrowing helper: true when a value is a known mode. */
export function isMode(value: unknown): value is string {
  return value === MODE.autonomous || value === MODE.copilot;
}
