// lib/events.ts
//
// The agentic console's memory.
//
// What was here: `logs` lived in React state, so F5 erased the record — for a
// product whose whole thesis is audit, an event log that dies with a page load
// is the contradiction the session notes had already flagged as pending. This
// gives it a home in storage, the same way the blocked ledger has one.
//
// Local only, and that is a decision rather than an omission. The durable copy
// on the server carries the two records a counterparty might read — the orders
// and the charges that were refused — while this is narration *about* what
// happened. Keeping a second copy would invite the question of which one is
// the audit, and the answer is the ledger: a refusal has to be a record, not a
// line of prose that can scroll away. The console survives a reload; it does
// not pretend to be the ledger it describes.
//
// Bounded, for the reason the ledger is: a log is for reading, not for growing
// without end.

/** Newest first, capped — the same shape the blocked ledger keeps. */
export const EVENT_STORAGE_KEY = "paypal-ai-agent.events.v1";

/** How many lines are kept. Enough for a session, small enough to re-read. */
const MAX_EVENTS = 100;

/**
 * What the console has said, newest first.
 *
 * Anything that is not a string is dropped: this list is rendered as text and
 * an object reaching it would print as `[object Object]` beside real events.
 */
export function readEvents(): string[] {
  try {
    const raw = window.localStorage.getItem(EVENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_EVENTS);
  } catch {
    // Private mode, disabled storage or unreadable JSON: the session keeps
    // working, it just will not survive the next reload.
    return [];
  }
}

/** Remember one line the console printed. */
export function recordEvent(message: string): void {
  const next = [message, ...readEvents()].slice(0, MAX_EVENTS);
  try {
    window.localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or private mode: the line stays on screen for this session, which
    // is the same trade-off every other write here makes.
  }
}

/**
 * What colour a line is — the console's second cue, never its only one.
 *
 * Four families, and the one that matters is the one that moved money:
 *
 *   red     a refusal, whatever produced it
 *   blue    the agent speaking (button or microphone, one actor)
 *   emerald **money that settled** — `✅ Captured`, and the lines that really
 *           move value
 *   slate   everything else, including permissions
 *
 * The emerald rule used to be inverted: `🟢 [POLICY] is now active` — which
 * reserves nothing and charges nothing — came out green, while an actual
 * capture printed slate. A console whose colours mean the opposite of its
 * words is worse than one with no colours, because the reader trusts the
 * colour first.
 */
export function logTone(log: string): string {
  if (log.includes("🚨") || log.includes("⚠️") || log.includes("❌") || log.includes("— refused")) {
    return "text-red-400 font-bold";
  }
  // The agent, whether it was reached through a button or through the
  // microphone. `🔊` is the line the agent *spoke*; keeping it the same colour
  // as `🤖` means one actor stays followable through a busy console without
  // reading every word.
  if (log.includes("🤖") || log.includes("🔊")) return "text-blue-300";
  if (log.includes("✅") || log.includes("🟢")) return "text-emerald-400";
  return "text-slate-200";
}
