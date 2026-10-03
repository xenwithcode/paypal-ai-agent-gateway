// lib/policy.ts
// Single source of truth for the status, action and mode strings that flow
// between the API routes (server) and the AG Grid UI (client).
//
// These values are written into grid cells and compared with `===`, so keeping
// them in one place prevents the classic "the row says X but the renderer
// looks for Y" bug. The transition rules live here too, so the server and the
// button that offers an action can never disagree about what is legal.
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
