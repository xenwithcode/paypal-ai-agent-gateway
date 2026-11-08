// tests/demo-script.test.ts
//
// The demo is a film, but its promises are testable: every step names a real
// surface, every action is one a page exposes, no action can move money, and
// every narration file it references exists in the repo. These are the rules
// that would otherwise be discovered by a judge watching a blank beat.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  DEMO_STEPS,
  DEMO_STEP_COUNT,
  DEMO_TOTAL_MS,
  demoProgress,
  stepAt,
} from "../lib/demo/script.ts";

const MONEY_MOVING = [
  "authorize",
  "capture",
  "pay",
  "fund",
  "pledge",
  "checkout",
  "release",
  "approve",
  "paypal",
];

test("the script has a unique, audio-backed step for every beat", () => {
  const ids = new Set<string>();
  for (const step of DEMO_STEPS) {
    assert.match(step.id, /^\d{2}-[a-z0-9-]+$/);
    assert.ok(!ids.has(step.id), `duplicate step id ${step.id}`);
    ids.add(step.id);
    assert.equal(step.audio, `/demo/audio/${step.id}.wav`);
    assert.ok(step.durationMs > 2_000, `${step.id} needs a measured duration`);
    assert.ok(step.holdMs >= 400, `${step.id} needs a beat after its action`);
    assert.ok(step.caption.trim().length > 0);
    assert.ok(step.narration.trim().length > 0);
  }
  assert.equal(ids.size, DEMO_STEP_COUNT);
});

test("every referenced narration file exists", () => {
  for (const step of DEMO_STEPS) {
    const file = join(process.cwd(), "public", step.audio.replace(/^\//, ""));
    assert.ok(existsSync(file), `missing ${file}`);
  }
});

test("each action belongs to the route it is performed on", () => {
  for (const step of DEMO_STEPS) {
    if (!step.action) continue;
    const surface = step.route === "/overview" ? "overview" : "crowdfunding";
    assert.equal(step.action.surface, surface, `${step.id} acts on the wrong surface`);
    assert.ok(
      !MONEY_MOVING.includes(step.action.name),
      `${step.id} uses a money-moving verb: ${step.action.name}`
    );
  }
});

test("the demo opens on Overview, crosses once, and ends on the result", () => {
  assert.equal(DEMO_STEPS[0].route, "/overview");
  assert.equal(DEMO_STEPS[0].intro, true);
  const last = DEMO_STEPS[DEMO_STEPS.length - 1];
  assert.equal(last.route, "/crowdfunding");
  assert.equal(last.id, "13-crowdfunding-result");
  assert.match(last.caption, /result/i, "the film must end on the result, not a spoken recap");

  const crossings = DEMO_STEPS.filter(
    (step, index) => index > 0 && step.route !== DEMO_STEPS[index - 1].route
  );
  assert.equal(crossings.length, 1, "the film should cross pages exactly once");
});

test("the film fits the hackathon's under-three-minute video", () => {
  const minutes = DEMO_TOTAL_MS / 60_000;
  assert.ok(minutes >= 2.5 && minutes < 3, `${minutes.toFixed(2)} minutes is outside the plan`);
});

test("stepAt and demoProgress are bounded", () => {
  assert.equal(stepAt(-1), null);
  assert.equal(stepAt(DEMO_STEP_COUNT), null);
  assert.equal(stepAt(0)?.id, DEMO_STEPS[0].id);
  assert.equal(demoProgress(-10), 0);
  assert.equal(demoProgress(DEMO_STEP_COUNT + 10), 1);
  assert.ok(demoProgress(1) > demoProgress(0));
});
