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
