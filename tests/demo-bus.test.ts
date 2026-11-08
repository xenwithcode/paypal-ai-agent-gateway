// tests/demo-bus.test.ts
//
// The kiosk and the pages agree through one registry. The failure this test
// guards against is silent: an action fired at a surface that is not mounted
// would otherwise be a no-op in front of a judge, or a hang.

import assert from "node:assert/strict";
import test from "node:test";
import {
  demoSurfaceReady,
  dispatchDemoAction,
  registerDemoSurface,
  waitForDemoSurface,
  type DemoAction,
} from "../lib/demo/bus.ts";

test("an action reaches the registered surface and returns its answer", async () => {
  const seen: DemoAction[] = [];
  const unregister = registerDemoSurface("overview", (action) => {
    seen.push(action);
    return { ok: true, name: action.name };
  });

  assert.equal(demoSurfaceReady("overview"), true);
  const result = await dispatchDemoAction({
    surface: "overview",
    name: "fillIntent",
    arg: "white sneakers",
  });

  assert.deepEqual(result, { ok: true, name: "fillIntent" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].arg, "white sneakers");
  unregister();
  assert.equal(demoSurfaceReady("overview"), false);
});

test("unregistering twice is harmless, and a stale surface cannot answer", async () => {
  const first = registerDemoSurface("crowdfunding", () => "first");
  const second = registerDemoSurface("crowdfunding", () => "second");
  assert.equal(await dispatchDemoAction({ surface: "crowdfunding", name: "reset" }), "second");
  first();
  assert.equal(await dispatchDemoAction({ surface: "crowdfunding", name: "reset" }), "second");
  second();
  assert.equal(demoSurfaceReady("crowdfunding"), false);
});

test("waitForDemoSurface resolves only after registration", async () => {
  assert.equal(demoSurfaceReady("overview"), false);
  const waiting = waitForDemoSurface("overview", 2_000);
  setTimeout(() => registerDemoSurface("overview", () => null), 40);
  await waiting;
  assert.equal(demoSurfaceReady("overview"), true);
});
