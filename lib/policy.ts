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
};

export type Verdict = {
  allowed: boolean;
  /** Every reason the charge was refused, not only the first. */
  violations: string[];
  reason: string;
};

/**
 * Judge an attempted charge against a policy.
 *
 * Every violation is reported rather than the first, because an approver who
 * only hears about the amount will fix the amount and re-run straight into
 * the destination rules.
 *
 * Deliberately does not evaluate price conditions — settling a condition is
 * the hold's job. Keeping the two apart means neither has to know whether the
 * other has run.
 */
export function judgeCharge(charge: ChargeAttempt, policy: PolicyEnvelope): Verdict {
  const violations: string[] = [];
  const endpoint = charge.endpoint ?? "";
  const chargePayee = charge.payee ?? "";
  const allowEndpoint = policy.allowEndpoint ?? "";
  const payee = policy.payee ?? "";

  // 1. Is the policy even armed? Nothing under draft or already settled may
  //    be charged, and the reason has to say so rather than failing vaguely.
  if (!SPENDABLE_STATUSES.includes(policy.status)) {
    violations.push(
      policy.status === STATUS.pending
        ? `The policy for "${policy.what}" has not been activated yet.`
        : `The policy for "${policy.what}" is ${policy.status}, so it no longer permits charges.`
    );
  }

  // 2. The ceiling.
  if (charge.currency !== policy.currency) {
    violations.push(
      `Currency mismatch: the charge is in ${charge.currency} but the ceiling is in ${policy.currency}.`
    );
  } else if (charge.amount > policy.limit) {
    violations.push(
      `Amount ${charge.amount.toFixed(2)} ${charge.currency} exceeds the ${policy.limit.toFixed(2)} ${policy.currency} ceiling.`
    );
  }

  // 3. The destination. An empty allow-list means no merchant was named and
  //    therefore nothing is restricted — stated plainly rather than implied.
  if (allowEndpoint && endpoint && endpoint !== allowEndpoint) {
    violations.push(
      `Endpoint ${endpoint} is not allowed for this order (only ${allowEndpoint}).`
    );
  }

  // 4. The recipient. Deliberately stricter than rule 3, and the reason is
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

  const allowed = violations.length === 0;

  return {
    allowed,
    violations,
    reason: allowed
      ? `Charge of ${charge.amount.toFixed(2)} ${charge.currency} is within "${policy.what}".`
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
