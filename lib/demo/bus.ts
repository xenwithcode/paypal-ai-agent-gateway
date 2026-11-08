// lib/demo/bus.ts
//
// The wire between the kiosk and the pages it drives.
//
// The demo is not a recording and not a mock: every action below is the same
// handler a button calls, through the same `/api/agent` and the same state the
// product uses. The kiosk and the page never share a React tree (the kiosk
// lives in the shell, the pages are its children), so the agreement between
// them is a tiny registry rather than a second copy of the logic.

export type DemoSurface = "overview" | "crowdfunding";

export type DemoActionName =
  | "reset"
  | "fillIntent"
  | "draft"
  | "choose"
  | "close"
  | "openFlight"
  | "selectProject"
  | "setAmount"
  | "addDemoPosition";

export type DemoAction = {
  surface: DemoSurface;
  name: DemoActionName;
  /** Intent text, candidate index or amount — whatever the action needs. */
  arg?: string | number;
};

type Handler = (action: DemoAction) => unknown | Promise<unknown>;

const handlers = new Map<DemoSurface, Handler>();

/**
 * How a page makes itself drivable.
 *
 * Returns its own unregister function: React effects call it on cleanup, and
 * a surface that has unmounted must not answer a later step. The kiosk waits
 * for the route it is about to act on rather than firing into a page that has
 * not mounted yet.
 */
export function registerDemoSurface(surface: DemoSurface, handler: Handler): () => void {
  handlers.set(surface, handler);
  return () => {
    if (handlers.get(surface) === handler) handlers.delete(surface);
  };
}

export function demoSurfaceReady(surface: DemoSurface): boolean {
  return handlers.has(surface);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run one action, waiting for its surface when the kiosk has just navigated.
 *
 * The timeout is deliberately a failure rather than a hang: a demo frozen on a
 * blank beat in front of a judge is worse than a demo that says which surface
 * did not arrive.
 */
export async function dispatchDemoAction(action: DemoAction, timeoutMs = 20_000): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  while (!handlers.has(action.surface)) {
    if (Date.now() > deadline) {
      throw new Error(`The ${action.surface} surface did not become ready.`);
    }
    await sleep(50);
  }
  return handlers.get(action.surface)!(action);
}

/** Resolve when the page for `surface` has registered its handlers. */
export async function waitForDemoSurface(surface: DemoSurface, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!handlers.has(surface)) {
    if (Date.now() > deadline) throw new Error(`The ${surface} page did not load.`);
    await sleep(50);
  }
}

export const DEMO_START_EVENT = "ppa:demo-start";

/** The sidebar's CTA: the kiosk listens for this and takes over. */
export function startDemo(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_START_EVENT));
}
