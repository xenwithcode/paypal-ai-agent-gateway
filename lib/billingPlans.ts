// lib/billingPlans.ts
//
// Reading a billing plan back, and admitting how much of it arrived.
//
// The reason this lives in its own module rather than inside `lib/paypal.ts`
// is the header the whole feature turns on: PayPal answers `listBillingPlans`
// with `id`, `status` and links unless the request carries
// `Prefer: return=representation`. With `return=minimal` the response has no
// `billingCycles` and no `paymentPreferences` — the only two things that say
// what a plan costs and when it charges — so a plan can be present and still
// be unable to name a price. Reading that as "free" is the mistake this file
// is written to make impossible: a missing cycle comes back as `null`, never
// as zero, and `describeCadence` says so in words.
//
// Both spellings are read throughout. The wire format is snake_case; the SDK
// hands over camelCase after deserializing; and the raw payload is what a
// `curl` check shows. Sitting one refactor apart, both are read rather than
// either assumed — the same rule `lib/paypal.ts` applies to balances.

/** One plan, reduced to the four things a subscriber actually asks. */
export type PlanSummary = {
  id: string;
  name: string;
  description: string;
  status: string;
  /** What one cycle costs, exactly as PayPal wrote it. `null` = not in the response. */
  price: string | null;
  currency: string | null;
  /** `DAY` · `WEEK` · `MONTH` · `YEAR`. `null` = no cycle came back. */
  interval: string | null;
  /** How many intervals per charge. `1` is "every month", not "monthly 1". */
  intervalCount: number | null;
  /** `0` means *until cancelled* — PayPal's own encoding. `null` means unknown. */
  totalCycles: number | null;
  /** Whether PayPal retries a failed payment. `null` when `paymentPreferences` is absent. */
  autoBillOutstanding: boolean | null;
  /** Which cycle the price was read from: a trial price is not what the plan costs. */
  cycleTenure: string | null;
  createTime: string | null;
};

/** What the ask came back with. Never a plan list without its provenance. */
export type PlansResult = {
  plans: PlanSummary[];
  /** `live` means PayPal answered. Anything else means it did not. */
  source: "live" | "unavailable";
  /** Plain reason when `source` is "unavailable". Never a stack trace. */
  reason: string | null;
  /** PayPal's own count, when it sent one. Not `plans.length`, which is a page. */
  total: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The first of `keys` that is actually present, so both spellings work. */
function read(source: unknown, ...keys: string[]): unknown {
  const record = asRecord(source);
  if (!record) return undefined;
  for (const key of keys) {
    if (key in record && record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function readString(source: unknown, ...keys: string[]): string | null {
  const value = read(source, ...keys);
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(source: unknown, ...keys: string[]): number | null {
  const value = read(source, ...keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(source: unknown, ...keys: string[]): boolean | null {
  const value = read(source, ...keys);
  return typeof value === "boolean" ? value : null;
}

function readArray(source: unknown, ...keys: string[]): unknown[] {
  const value = read(source, ...keys);
  return Array.isArray(value) ? value : [];
}

/**
 * The regular cycle — the one a subscriber pays — or, failing that, the last
 * one PayPal sent.
 *
 * Ordering is by sequence: trials come first, the regular cycle last, so
 * "last" is a reasonable fallback. Taking the *first* cycle instead would
 * price a plan by its free trial, which is exactly how a plan comes out
 * reading "0.00 / month" and looking like a bug in PayPal rather than in us.
 */
export function regularCycle(plan: unknown): Record<string, unknown> | null {
  const cycles = readArray(plan, "billingCycles", "billing_cycles");
  const records = cycles.map(asRecord).filter((c): c is Record<string, unknown> => c !== null);
  if (records.length === 0) return null;

  const regular = records.filter(
    (cycle) => (readString(cycle, "tenureType", "tenure_type") ?? "").toUpperCase() === "REGULAR"
  );
  return regular[regular.length - 1] ?? records[records.length - 1];
}

/** One plan as this product reads it. Pure: no network, no throw, no guess. */
export function summarisePlan(raw: unknown): PlanSummary {
  const plan = asRecord(raw);
  if (!plan) {
    return {
      id: "",
      name: "",
      description: "",
      status: "",
      price: null,
      currency: null,
      interval: null,
      intervalCount: null,
      totalCycles: null,
      autoBillOutstanding: null,
      cycleTenure: null,
      createTime: null,
    };
  }

  const cycle = regularCycle(plan);
  const pricing = read(cycle, "pricingScheme", "pricing_scheme");
  const fixed = read(pricing, "fixedPrice", "fixed_price");
  const frequency = read(cycle, "frequency");
  const preferences = read(plan, "paymentPreferences", "payment_preferences");

  return {
    id: readString(plan, "id") ?? "",
    name: readString(plan, "name") ?? "",
    description: readString(plan, "description") ?? "",
    status: readString(plan, "status") ?? "",
    price: readString(fixed, "value"),
    currency: readString(fixed, "currencyCode", "currency_code"),
    interval: readString(frequency, "intervalUnit", "interval_unit", "interval"),
    intervalCount: readNumber(frequency, "intervalCount", "interval_count"),
    totalCycles: readNumber(cycle, "totalCycles", "total_cycles"),
    autoBillOutstanding: readBoolean(preferences, "autoBillOutstanding", "auto_bill_outstanding"),
    cycleTenure: readString(cycle, "tenureType", "tenure_type"),
    createTime: readString(plan, "createTime", "create_time"),
  };
}

/** `9.99 USD` — or a sentence saying the response did not carry a price. */
export function describePrice(plan: PlanSummary): string {
  if (plan.price === null) return "no price in this response";
  return plan.currency ? `${plan.price} ${plan.currency}` : plan.price;
}

const UNIT_PLURAL: Record<string, [string, string]> = {
  DAY: ["day", "days"],
  WEEK: ["week", "weeks"],
  MONTH: ["month", "months"],
  YEAR: ["year", "years"],
};

/**
 * How often it charges, and for how long — in the words a subscriber would
 * use, with the unknowns left unknown.
 *
 * Two cases this is careful about, because both read as bugs when they are
 * really answers: `total_cycles: 0` is PayPal's *until cancelled* and not a
 * plan that stops immediately, and an absent cycle (the `Prefer` header not
 * sent, or a `CREATED` plan never priced) is "not in this response" rather
 * than "free" or "one-off".
 */
export function describeCadence(plan: PlanSummary): string {
  if (!plan.interval) return "no billing cycle in this response";

  const [one, many] = UNIT_PLURAL[plan.interval.toUpperCase()] ?? [
    plan.interval.toLowerCase(),
    `${plan.interval.toLowerCase()}s`,
  ];
  const count = plan.intervalCount ?? 1;
  const every = count === 1 ? `every ${one}` : `every ${count} ${many}`;

  if (plan.totalCycles === null) return every;
  if (plan.totalCycles === 0) return `${every} · until cancelled`;
  return `${every} · ${plan.totalCycles} ${plan.totalCycles === 1 ? "cycle" : "cycles"}`;
}
