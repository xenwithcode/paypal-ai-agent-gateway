// tests/demo-scenario.test.ts
//
// The recorded scenario is still a real envelope: a ceiling, a condition, a
// window in the future, and two catalog records whose prices make the human's
// override meaningful. These are the rules that would otherwise be discovered
// by a judge watching a card that says "NOT met" for no visible reason.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  DEMO_SCENARIO_CANDIDATES,
  DEMO_SCENARIO_MATCHED_ID,
  demoScenarioPolicy,
  nextFridayISO,
} from "../lib/demo/scenario.ts";
import { evaluateCondition } from "../lib/commerce/catalog.ts";

test("the scenario has exactly the two candidates the film shows", () => {
  assert.equal(DEMO_SCENARIO_CANDIDATES.length, 2);
  assert.deepEqual(
    DEMO_SCENARIO_CANDIDATES.map((candidate) => candidate.id),
    [91, 92]
  );
  assert.equal(DEMO_SCENARIO_MATCHED_ID, 91);
});

test("the agent's pick misses the condition and the human's meets it", () => {
  const policy = demoScenarioPolicy(new Date("2026-11-08T12:00:00Z"));
  const agentPick = DEMO_SCENARIO_CANDIDATES.find(
    (candidate) => candidate.id === DEMO_SCENARIO_MATCHED_ID
  );
  const humanPick = DEMO_SCENARIO_CANDIDATES.find(
    (candidate) => candidate.id !== DEMO_SCENARIO_MATCHED_ID
  );
  assert.ok(agentPick && humanPick);
  assert.equal(agentPick.price, 119.99);
  assert.equal(humanPick.price, 109.99);
  assert.equal(evaluateCondition(policy.condition, agentPick).met, false);
  assert.equal(evaluateCondition(policy.condition, humanPick).met, true);
});

test("the window is a real future Friday, not a fixed date that expires", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const next = nextFridayISO(now);
  assert.match(next, /^\d{4}-\d{2}-\d{2}$/);
  const date = new Date(`${next}T12:00:00Z`);
  assert.equal(date.getUTCDay(), 5);
  assert.ok(date.getTime() > now.getTime());
});

test("the scenario's product images ship with the repo", () => {
  for (const candidate of DEMO_SCENARIO_CANDIDATES) {
    for (const image of candidate.images) {
      const file = join(process.cwd(), "public", image.replace(/^\//, ""));
      assert.ok(existsSync(file), `missing ${file}`);
    }
  }
});
