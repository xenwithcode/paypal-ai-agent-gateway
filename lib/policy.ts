// lib/policy.ts
// Single source of truth for the status and agent-mode strings that flow
// between the API routes (server) and the AG Grid UI (client).
//
// These values are written into grid cells and compared with `===`, so keeping
// them in one place prevents the classic "the row says X but the renderer
// looks for Y" bug.
//
// Copy rule: these are read by a person under time pressure. They say the
// state and the next action in plain words — never internal machinery
// ("enforcement", "kernel", "gateway") in a label the user has to decode.

/** Lifecycle of a spend policy, shown in the Protection column. */
export const STATUS = {
  /** Approved and currently enforced. */
  enforced: "Active",
  /** Generated but not yet approved by the human operator. */
  pending: "Awaiting approval",
  /** FX shield is actively guarding the balance. */
  protecting: "Protecting",
} as const;

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

/** Narrowing helper: true when a value is a known status. */
export function isStatus(value: unknown): value is string {
  return value === STATUS.enforced || value === STATUS.pending || value === STATUS.protecting;
}
