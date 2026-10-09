// tests/events.test.ts
//
// What colour a line gets, and what the console remembers.
//
// The tone rule was inverted before this file existed: `🟢 [POLICY] is now
// active` — which reserves nothing and charges nothing — came out emerald,
// while an actual capture printed slate. A console whose colours mean the
// opposite of its words is worse than one with no colours, because the reader
// trusts the colour first and reads the words second.
//
// So the families are pinned here: red is a refusal, blue is the agent
// speaking, emerald is money that settled, and everything else — permissions
// included — is plain.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EVENT_STORAGE_KEY, logTone, readEvents, recordEvent } from "../lib/events.ts";

test("a refusal shouts, whatever produced it", () => {
  assert.equal(logTone("🚨 [BLOCKED] Amount exceeds the ceiling."), "text-red-400 font-bold");
  assert.equal(logTone("❌ [HOLD] The transition was refused."), "text-red-400 font-bold");
  assert.equal(logTone("⚠️ [LIMIT] Too many requests."), "text-red-400 font-bold");
  assert.equal(logTone("charged — refused by the window"), "text-red-400 font-bold");
});

test("the agent stays one colour, spoken or pressed", () => {
  assert.equal(logTone("🤖 [AGENT] Captured 20.00 USD."), "text-blue-300");
  assert.equal(logTone("🔊 [VOICE] Drafting an order."), "text-blue-300");
});

test("emerald means money settled — not permission", () => {
  // The two lines this file exists to tell apart.
  assert.equal(logTone("✅ [HOLD] Captured 20.00 USD for \"Transfer\"."), "text-emerald-400");
  assert.equal(logTone("🟢 [Agent]: 900 PYUSD reinjected."), "text-emerald-400");
  // A permission is not a payment: it reads as plain text, because green is
  // the second cue for "the money moved" and this line says the opposite.
  assert.equal(
    logTone("🔓 [POLICY] \"Transfer to someone\" is now active. Ceiling: 20.00 USD."),
    "text-slate-200"
  );
});

test("everything unmarked reads plain", () => {
  assert.equal(logTone("📨 Drafting an order from: \"sneakers\""), "text-slate-200");
  assert.equal(logTone(""), "text-slate-200");
});

// ─── What the console remembers ─────────────────────────────────────────────

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const store = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => void store.set(key, value),
};
(globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: storage };

beforeEach(() => store.clear());

test("a line survives the reload that used to erase it", () => {
  recordEvent("[10:09:48 PM] 🔓 [POLICY] \"Transfer\" is now active.");
  assert.deepEqual(readEvents(), ['[10:09:48 PM] 🔓 [POLICY] "Transfer" is now active.']);
  assert.ok(store.has(EVENT_STORAGE_KEY), "it was written, not only returned");
});

test("newest first, and only strings are kept", () => {
  recordEvent("first");
  recordEvent("second");
  assert.deepEqual(readEvents(), ["second", "first"]);

  // Something else wrote garbage into the key: the reader drops it rather than
  // handing a renderer an object to print as [object Object].
  store.set(EVENT_STORAGE_KEY, JSON.stringify(["a", 42, { b: 1 }, null]));
  assert.deepEqual(readEvents(), ["a"]);
  store.set(EVENT_STORAGE_KEY, "not json");
  assert.deepEqual(readEvents(), []);
});
