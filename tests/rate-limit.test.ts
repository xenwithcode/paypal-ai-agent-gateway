// tests/rate-limit.test.ts
//
// The meter in front of the route that spends money.
//
// The cases worth protecting are the ones a fixed counter would get wrong: a
// window that resets on a calendar tick lets a caller spend the limit twice in
// one second, and a `Retry-After` of zero sends the caller straight back in.
// The clock is injected so both boundaries are pinned here rather than by
// waiting for one in real time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimit, keyFromHeaders } from "../lib/rateLimit.ts";

/** A limiter with a clock the test drives by hand. */
function limiter(max: number, windowMs: number) {
  let clock = 0;
  const rate = createRateLimit({ max, windowMs, now: () => clock });
  return {
    rate,
    advance: (ms: number) => {
      clock += ms;
    },
    set: (ms: number) => {
      clock = ms;
    },
    get clock() {
      return clock;
    },
  };
}

test("everything inside the window is allowed, the next one is not", () => {
  const { rate } = limiter(3, 1000);
  assert.equal(rate.check("a").allowed, true);
  assert.equal(rate.check("a").allowed, true);
  assert.equal(rate.check("a").allowed, true);

  const refused = rate.check("a");
  assert.equal(refused.allowed, false);
});

test("a refusal says when to come back, and never says zero seconds", () => {
  // Retry-After: 0 reads as "now", which is not true — the caller would go
  // straight back in and be refused again. It counts from the oldest hit, so
  // it is the first moment a slot actually frees up.
  const t = limiter(1, 10_000);
  t.rate.check("a");
  t.advance(1000); // one second of the window has already gone

  const refused = t.rate.check("a");
  assert.equal(refused.allowed, false);
  assert.ok(refused.retryAfterSeconds >= 1, String(refused.retryAfterSeconds));
  assert.equal(refused.retryAfterSeconds, 9, "the ten second window has one second left");
});

test("an allowed request does not report a wait", () => {
  const { rate } = limiter(5, 1000);
  assert.equal(rate.check("a").retryAfterSeconds, 0);
});

test("the window slides, so the limit cannot be spent twice in one second", () => {
  // What a fixed counter reset on a tick would allow: max at 0:59, max again
  // at 1:00 — twice the limit inside one second.
  const t = limiter(2, 1000);
  t.rate.check("a");
  t.advance(900);
  t.rate.check("a");
  assert.equal(t.rate.check("a").allowed, false, "still two inside the window");

  t.advance(200); // 1100 — the first hit is now 1100ms old
  assert.equal(t.rate.check("a").allowed, true, "one slot has slid free");
});

test("a hit expires exactly one window after it happened", () => {
  const t = limiter(1, 1000);
  t.rate.check("a");
  t.advance(999);
  assert.equal(t.rate.check("a").allowed, false, "999ms is still inside 1000ms");
  t.advance(1);
  assert.equal(t.rate.check("a").allowed, true, "1000ms is the window, not inside it");
});

test("keys do not spend each other's allowance", () => {
  const { rate } = limiter(1, 1000);
  assert.equal(rate.check("a").allowed, true);
  assert.equal(rate.check("a").allowed, false);
  assert.equal(rate.check("b").allowed, true, "b has its own window");
});

test("a key is remembered only as far as the limit needs", () => {
  // Cap per key at `max` timestamps: whatever a caller does, one key costs
  // `max` numbers, not one entry per request forever.
  const rate = createRateLimit({ max: 3, windowMs: 60_000, now: () => 1 });
  for (let i = 0; i < 50; i += 1) rate.check("a");
  // 50 requests all inside one window: still exactly `max` before refusal.
  assert.equal(rate.check("a").allowed, false);
});

test("idle keys are swept once the table is full", () => {
  const t = limiter(5, 1000);
  const rate = createRateLimit({ max: 5, windowMs: 1000, maxKeys: 3, now: () => t.clock });

  rate.check("old-1");
  rate.check("old-2");
  t.advance(5000); // those two are long gone
  rate.check("new-1");
  rate.check("new-2");
  rate.check("new-3"); // table is over maxKeys now, so it sweeps

  // The sweep must not touch a key that is still inside its window. Exhausting
  // new-1 is what proves it: its history arrived with one request already on
  // the books, so it takes four more to fill the window and the fifth is
  // refused. If the sweep had dropped it, new-1 would start empty and allow
  // five — one more than this asserts.
  let allowed = 0;
  while (rate.check("new-1").allowed) allowed += 1;
  assert.equal(allowed, 4, "the sweep kept a key that was still live");
});

test("reset forgets everything", () => {
  const { rate } = limiter(1, 1000);
  rate.check("a");
  assert.equal(rate.check("a").allowed, false);
  rate.reset();
  assert.equal(rate.check("a").allowed, true);
});

// ─── Who is calling ────────────────────────────────────────────────────────

test("the key is the first address a proxy reported", () => {
  // Only the first entry matters: a caller may append to the list, so
  // trusting the last one would let anyone choose their own key.
  const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" });
  assert.equal(keyFromHeaders(headers), "203.0.113.9");
});

test("with no proxy at all there is one caller, and it is called local", () => {
  assert.equal(keyFromHeaders(new Headers()), "local");
});

test("an empty forwarded header is not a key", () => {
  assert.equal(keyFromHeaders(new Headers({ "x-forwarded-for": "   " })), "local");
  assert.equal(keyFromHeaders(new Headers({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
});
