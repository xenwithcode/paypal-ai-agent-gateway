// lib/demo/bus.ts
//
// The kiosk's brain, and the seam that makes the demo possible at all.
//
// Two things live here, both deliberately framework-free so they can be tested
// with the same `node:test` runner as the rest of the repo:
//
// 1. **A tiny store** for the demo's state (idle / playing / paused / finished
//    + which step). The Sidebar's ▶ button and the floating control bar are in
//    different components — the Sidebar writes, the bar reads — and this is the
//    module they both import. It is not a context because the state is not
//    "app-wide configuration": it is one machine with four transitions, and a
//    module singleton is the honest size for it.
//
// 2. **The surface registry.** The hard part of a self-driving demo is that
//    `AgentGrid` (1,900 lines) exposes nothing: no context, no imperative
//    handle, no callbacks from outside. Simulating clicks in the DOM would mean
//    fighting React's controlled inputs. So instead the page registers its own
//    handlers here on mount and unregisters on unmount, and the driver talks to
//    "the page" instead of to React internals. The registration is what makes
//    the demo *the product running*: every action is the same function the
//    button calls.
//
// The driver (DemoKiosk.tsx) is the only consumer of `waitForDemoSurface`; the
// surfaces themselves only ever call `registerDemoSurface`.

import {
  FIRST_STEP_INDEX,
  type DemoRoute,
  type DemoStep,
  stepAt,
} from "./script.ts";

export type DemoStatus = "idle" | "playing" | "paused" | "finished";

export type DemoState = {
  status: DemoStatus;
  /** Index into `DEMO_STEPS`. Meaningful while playing/paused/finished. */
  index: number;
};

/**
 * A page's offer to the driver.
 *
 * `actions` is keyed by the names in `script.ts` (`OVERVIEW_ACTIONS`,
 * `CROWDFUNDING_ACTIONS`); the driver looks up by name and passes an optional
 * argument (the intent text, or the amount).
 */
export type DemoSurface = {
  route: DemoRoute;
  actions: Record<string, (arg?: string | number) => Promise<void> | void>;
};

const INITIAL_STATE: DemoState = { status: "idle", index: FIRST_STEP_INDEX };

let state: DemoState = { ...INITIAL_STATE };
const listeners = new Set<() => void>();

function setState(patch: Partial<DemoState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

/** Current state. Passed to `useSyncExternalStore` as the snapshot. */
export function getDemoState(): DemoState {
  return state;
}

/** Subscribe to changes; returns the unsubscribe function. */
export function subscribeDemo(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** ▶ — from anywhere: the Sidebar, StartHere's "Rather watch?", a URL flag. */
export function startDemo(): void {
  setState({ status: "playing", index: FIRST_STEP_INDEX });
}

/** ⏸ — freezes between steps. Resuming re-enters the current step. */
export function pauseDemo(): void {
  if (state.status === "playing") setState({ status: "paused" });
}

/** ▶▶ — only meaningful after a pause. */
export function resumeDemo(): void {
  if (state.status === "paused") setState({ status: "playing" });
}

/**
 * ⏭ — skip the rest of the current step.
 *
 * Deliberately allowed while paused too: a judge who paused, looked around and
 * lost patience should not have to resume first to skip.
 */
export function skipDemoStep(): void {
  if (state.status !== "playing" && state.status !== "paused") return;
  const next = state.index + 1;
  if (stepAt(next) === null) {
    // Past the last step the script does not loop: it finishes and stays
    // finished, with the hand-off step's caption still on screen.
    setState({ status: "finished" });
    return;
  }
  setState({ status: "playing", index: next });
}

/** The script ran out. Called by the driver after the last hold elapses. */
export function finishDemo(): void {
  if (state.status === "playing") setState({ status: "finished" });
}

/**
 * ✕ — leave the demo. Back to the first step and idle, from any state.
 *
 * The page cleanup (`close`) is the driver's job; this only forgets where the
 * script was, so a later ▶ starts from the top.
 */
export function exitDemo(): void {
  state = { ...INITIAL_STATE };
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

let surface: DemoSurface | null = null;

/**
 * A page offering its handlers to the driver.
 *
 * Returns the unregister function. Calling it twice with the same route is
 * fine — the newer registration replaces the older one, which is how a page
 * keeps its actions current across re-renders without re-running the driver.
 */
export function registerDemoSurface(next: DemoSurface): () => void {
  surface = next;
  return () => {
    // Only clear if nobody re-registered in the meantime (StrictMode's double
    // effect, or a slow unmount racing the next mount).
    if (surface === next) surface = null;
  };
}

/** The registered surface for `route`, if the page is mounted. */
export function getDemoSurface(route: DemoRoute): DemoSurface | null {
  return surface && surface.route === route ? surface : null;
}

/**
 * Wait until the page for `route` has registered itself.
 *
 * The driver navigates first and then waits: a client-side navigation mounts
 * the new page asynchronously, and acting before it registers would be acting
 * on nothing. Resolves with the surface at the moment it appears (never a
 * cached one, so the actions are the page's current closures), or `null` on
 * timeout — the driver treats `null` as "stop here", which in front of a judge
 * is better than a script that silently does nothing for the rest of the run.
 */
export function waitForDemoSurface(
  route: DemoRoute,
  timeoutMs: number,
  pollMs = 100,
): Promise<DemoSurface | null> {
  const found = getDemoSurface(route);
  if (found) return Promise.resolve(found);

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const current = getDemoSurface(route);
      if (current) {
        resolve(current);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }
      setTimeout(tick, pollMs);
    };
    tick();
  });
}

/**
 * For tests: put the store back the way it started.
 *
 * Not used by the app — the demo is per-session by design (a refresh is a new
 * session, and the script starts from the top).
 */
export function resetDemoForTests(): void {
  state = { ...INITIAL_STATE };
  surface = null;
  for (const listener of listeners) listener();
}

/**
 * The step the driver should run, or null when there is nothing to run.
 *
 * Null while idle and while finished: the last step's caption stays on screen
 * after the run ends (the bar keeps reading `state.index`), but nothing is due
 * to execute — which is exactly the hand-off the script is built around.
 */
export function currentStep(): DemoStep | null {
  if (state.status !== "playing" && state.status !== "paused") return null;
  return stepAt(state.index);
}
