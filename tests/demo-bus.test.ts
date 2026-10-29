// tests/demo-bus.test.ts
//
// The kiosk's state machine and its surface registry. The store is the only
// thing the Sidebar button and the floating control bar share, so its
// transitions are pinned: in particular that ✕ forgets where the script was,
// that ⏭ works even while paused, and that the script finishes rather than
// looping back to the top in front of a judge.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  currentStep,
  exitDemo,
  finishDemo,
  getDemoState,
  getDemoSurface,
  pauseDemo,
  registerDemoSurface,
  resetDemoForTests,
  resumeDemo,
  skipDemoStep,
  startDemo,
  subscribeDemo,
  waitForDemoSurface,
} from "../lib/demo/bus.ts";
import { FIRST_STEP_INDEX, LAST_STEP_INDEX } from "../lib/demo/script.ts";

beforeEach(() => {
  resetDemoForTests();
});

test("start → pause → resume → finish walks the script without looping", () => {
  startDemo();
  assert.deepEqual(getDemoState(), { status: "playing", index: FIRST_STEP_INDEX });

  pauseDemo();
  assert.equal(getDemoState().status, "paused");

  resumeDemo();
  assert.equal(getDemoState().status, "playing");

  // Run to the end by skipping every remaining step.
  while (getDemoState().status === "playing") skipDemoStep();
  assert.deepEqual(getDemoState(), { status: "finished", index: LAST_STEP_INDEX });

  // The last skip already finished it; one more changes nothing.
  skipDemoStep();
  assert.equal(getDemoState().status, "finished");
  assert.equal(currentStep(), null);
});

test("skip works while paused too — a judge who looked around can still skip", () => {
  startDemo();
  pauseDemo();
  skipDemoStep();
  assert.equal(getDemoState().status, "playing");
  assert.equal(getDemoState().index, FIRST_STEP_INDEX + 1);
});

test("exit returns to the first step, from anywhere", () => {
  startDemo();
  skipDemoStep();
  skipDemoStep();
  pauseDemo();
  exitDemo();
  assert.deepEqual(getDemoState(), { status: "idle", index: FIRST_STEP_INDEX });
});

test("pause and resume outside their turn are no-ops, not corruption", () => {
  pauseDemo(); // idle
  assert.equal(getDemoState().status, "idle");
  resumeDemo(); // idle
  assert.equal(getDemoState().status, "idle");
  startDemo();
  resumeDemo(); // already playing
  assert.equal(getDemoState().status, "playing");
});

test("finishDemo is how the driver ends the last step — only from playing", () => {
  finishDemo(); // idle
  assert.equal(getDemoState().status, "idle");
  startDemo();
  finishDemo();
  assert.equal(getDemoState().status, "finished");
});

test("subscribers are notified on every transition and can unsubscribe", () => {
  let calls = 0;
  const unsubscribe = subscribeDemo(() => {
    calls += 1;
  });
  startDemo();
  assert.equal(calls, 1);
  unsubscribe();
  pauseDemo();
  assert.equal(calls, 1);
});

test("a surface registers, is found by route, and unregisters cleanly", () => {
  const overview = registerDemoSurface({
    route: "/overview",
    actions: { fillIntent: () => {} },
  });
  assert.equal(getDemoSurface("/overview")?.actions.fillIntent != null, true);
  assert.equal(getDemoSurface("/crowdfunding"), null);

  // Re-registering with the same route replaces it (the current-closure rule).
  const newer = registerDemoSurface({
    route: "/overview",
    actions: { draft: () => {} },
  });
  assert.equal(getDemoSurface("/overview")?.actions.draft != null, true);

  // The stale unregister must not tear down the newer registration.
  overview();
  assert.notEqual(getDemoSurface("/overview"), null);
  newer();
  assert.equal(getDemoSurface("/overview"), null);
});

test("waitForDemoSurface resolves as soon as the page registers", async () => {
  const pending = waitForDemoSurface("/crowdfunding", 5000, 10);
  setTimeout(() => {
    registerDemoSurface({ route: "/crowdfunding", actions: { setAmount: () => {} } });
  }, 30);
  const surface = await pending;
  assert.equal(surface?.route, "/crowdfunding");
});

test("waitForDemoSurface gives up with null rather than hanging forever", async () => {
  const surface = await waitForDemoSurface("/overview", 40, 10);
  assert.equal(surface, null);
});
