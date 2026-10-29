// tests/demo-script.test.ts
//
// The kiosk script is the part of the demo a judge watches, so the rules it
// is written under are pinned here: it stops before money, it only calls
// functions the pages actually expose, and every step is long enough to read.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CROWDFUNDING_ACTIONS,
  DEMO_STEPS,
  LAST_STEP_INDEX,
  MONEY_MOVING_ACTIONS,
  OVERVIEW_ACTIONS,
  demoProgress,
  stepAt,
} from "../lib/demo/script.ts";

test("the script starts on Overview and stops on crowdfunding, without looping", () => {
  assert.equal(DEMO_STEPS[0].route, "/overview");
  assert.equal(DEMO_STEPS[LAST_STEP_INDEX].route, "/crowdfunding");
  assert.equal(stepAt(-1), null);
  assert.equal(stepAt(DEMO_STEPS.length), null);
  assert.equal(stepAt(LAST_STEP_INDEX)?.id, DEMO_STEPS[LAST_STEP_INDEX].id);
});

test("every step is on a route the demo knows, and carries a caption worth reading", () => {
  const routes = new Set(["/overview", "/crowdfunding"]);
  for (const step of DEMO_STEPS) {
    assert.ok(routes.has(step.route), `unknown route on step ${step.id}`);
    assert.ok(step.caption.trim().length > 0, `empty caption on step ${step.id}`);
    // A caption read from a metre away needs a beat: 1.5s is the floor.
    assert.ok(
      step.holdMs >= 1500,
      `step ${step.id} holds ${step.holdMs}ms — too short to read`,
    );
  }
});

test("every action names a function a surface really exposes", () => {
  const known: Record<string, readonly string[]> = {
    "/overview": OVERVIEW_ACTIONS,
    "/crowdfunding": CROWDFUNDING_ACTIONS,
  };
  for (const step of DEMO_STEPS) {
    if (!step.action) continue;
    const exposed = known[step.action.surface];
    assert.ok(exposed, `step ${step.id} targets an unknown surface`);
    assert.ok(
      exposed.includes(step.action.name),
      `step ${step.id} calls ${step.action.name}, which ${step.action.surface} does not expose`,
    );
  }
});

test("the script never moves money — it stops in front of the PayPal button", () => {
  for (const step of DEMO_STEPS) {
    if (!step.action) continue;
    const movesMoney = MONEY_MOVING_ACTIONS.some(
      (forbidden) =>
        step.action?.name === forbidden || step.action?.name.includes(forbidden),
    );
    assert.ok(
      !movesMoney,
      `step ${step.id} calls ${step.action.name}, which moves money`,
    );
  }
});

test("exactly one step hands control back, and it is the last one", () => {
  const handOffs = DEMO_STEPS.filter((step) => step.handOff);
  assert.equal(handOffs.length, 1);
  assert.equal(handOffs[0].id, DEMO_STEPS[LAST_STEP_INDEX].id);
});

test("the two requests are the demo's thesis: no amount first, then a ceiling", () => {
  const drafts = DEMO_STEPS.filter((step) => step.action?.name === "draft");
  assert.equal(drafts.length, 2);
  const [withoutAmount, withAmount] = drafts.map((step) => step.action?.arg);
  assert.equal(typeof withoutAmount, "string");
  assert.equal(typeof withAmount, "string");
  // The first must not state a price: it is the request that has to make the
  // gateway ask, which is the bug this demo would have caught on day one.
  assert.ok(!/\d/.test(withoutAmount as string), "first request already states a number");
  assert.ok(/\d/.test(withAmount as string), "second request has no ceiling to search under");
});

test("progress is a monotonic 0 → 1 across the run", () => {
  assert.equal(demoProgress(0), 0);
  assert.equal(demoProgress(LAST_STEP_INDEX), 1);
  const samples = DEMO_STEPS.map((_, i) => demoProgress(i));
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(samples[i] > samples[i - 1], `progress went backwards at ${i}`);
  }
  // Clamped: asking for a step past the end is not an error, it is the end.
  assert.equal(demoProgress(DEMO_STEPS.length + 5), 1);
  assert.equal(demoProgress(-3), 0);
});
