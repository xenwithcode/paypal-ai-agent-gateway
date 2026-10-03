// tests/policy.test.ts
//
// The transition rules are shared between the server that enforces them and
// the button that offers the action, so the contract has to be pinned: if
// either side drifts, the grid offers a control the API will refuse.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS,
  MODE,
  MODE_OPTIONS,
  canPerform,
  isHoldAction,
  isMode,
  isStatus,
  statusAfterActivate,
} from "../lib/policy.ts";

test("status strings are stable — the grid compares them with ===", () => {
  assert.equal(STATUS.pending, "Awaiting approval");
  assert.equal(STATUS.reserved, "Reserved");
  assert.equal(STATUS.captured, "Captured");
  assert.equal(STATUS.released, "Released");
  assert.equal(STATUS.enforced, "Active");
  assert.equal(STATUS.protecting, "Protecting");
});

test("isStatus accepts every known status and nothing else", () => {
  for (const status of Object.values(STATUS)) {
    assert.equal(isStatus(status), true, `${status} should be known`);
  }
  assert.equal(isStatus("Flying"), false);
  assert.equal(isStatus(""), false);
  assert.equal(isStatus(undefined), false);
  assert.equal(isStatus(null), false);
});

test("an action is only legal from the status the rules allow", () => {
  // Activate is for drafts. Nothing already live, held or settled may be
  // activated a second time.
  assert.equal(canPerform("activate", STATUS.pending), true);
  for (const status of Object.values(STATUS)) {
    if (status === STATUS.pending) continue;
    assert.equal(canPerform("activate", status), false, `activate from ${status}`);
  }

  // Capture and release are how a hold is settled — both need a hold.
  assert.equal(canPerform("capture", STATUS.reserved), true);
  assert.equal(canPerform("release", STATUS.reserved), true);
  for (const status of [STATUS.pending, STATUS.enforced, STATUS.captured, STATUS.released, STATUS.protecting]) {
    assert.equal(canPerform("capture", status), false, `capture from ${status}`);
    assert.equal(canPerform("release", status), false, `release from ${status}`);
  }
});

test("activating a conditional order reserves it; a plain one goes live", () => {
  // The whole thesis in one assertion: money is set aside before it may
  // move only when something has to be waited for.
  assert.equal(statusAfterActivate("price <= 100"), STATUS.reserved);
  assert.equal(statusAfterActivate("in stock"), STATUS.reserved);
  assert.equal(statusAfterActivate("  price <= 100  "), STATUS.reserved);

  // Whitespace alone is not a condition.
  assert.equal(statusAfterActivate(""), STATUS.enforced);
  assert.equal(statusAfterActivate("   "), STATUS.enforced);
});

test("only the three lifecycle actions are accepted", () => {
  assert.equal(isHoldAction("activate"), true);
  assert.equal(isHoldAction("capture"), true);
  assert.equal(isHoldAction("release"), true);
  assert.equal(isHoldAction("evaluate"), false);
  assert.equal(isHoldAction("refund"), false);
  assert.equal(isHoldAction(undefined), false);
});

test("modes stay recognizable, or the select editor renders blank", () => {
  assert.equal(MODE.autonomous, "Autonomous");
  assert.equal(MODE.copilot, "Copilot");
  assert.deepEqual(MODE_OPTIONS, [MODE.autonomous, MODE.copilot]);
  assert.equal(isMode(MODE.autonomous), true);
  assert.equal(isMode(MODE.copilot), true);
  assert.equal(isMode("Autonomous "), false);
  assert.equal(isMode("manual"), false);
});
