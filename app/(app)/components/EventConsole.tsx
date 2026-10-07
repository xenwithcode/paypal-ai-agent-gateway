// app/(app)/components/EventConsole.tsx
"use client";

import type { ReactNode } from "react";

/**
 * What the agent has been doing, wherever it happens.
 *
 * Extracted because there are now two surfaces that need it: the dashboard,
 * which drives it live, and Recurring, which reads what the dashboard — and
 * the agent running on it — recorded. One console component means one place
 * the tone rules and the empty state live, and it means adding a section does
 * not mean inventing a second, slightly different log.
 *
 * The component owns no state: the caller passes the lines. A console that
 * fetched its own events would re-render on a timer and hide which events
 * arrived when, and "what just happened" is the only question it exists to
 * answer.
 *
 * `role="log"` with `aria-live` because a screen reader otherwise hears
 * nothing at all: the region is added to and removed from constantly, and
 * without it the console is a visual-only feature on a product that has
 * refused those everywhere else.
 */

/**
 * What colour a line is: refusals shout whatever produced them, because a
 * charge that was stopped is the event worth catching at a glance. The agent
 * then gets a colour of its own — in a console this busy, following one actor
 * without reading every word is the difference between watching it work and
 * watching text scroll.
 */
export function logTone(log: string): string {
  if (log.includes("🚨") || log.includes("⚠️") || log.includes("❌") || log.includes("— refused")) {
    return "text-red-400 font-bold";
  }
  if (log.includes("🤖")) return "text-sky-300";
  if (log.includes("🟢")) return "text-emerald-400";
  return "text-slate-200";
}

export default function EventConsole({
  events,
  title = "🖥️ Agentic Event Console (UCP & Gateway stream)",
  actions,
  emptyNote = "Nothing yet.",
}: {
  events: string[];
  title?: string;
  /** Buttons that belong to this surface — the dashboard's controls live here. */
  actions?: ReactNode;
  emptyNote?: string;
}) {
  return (
    <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl border border-slate-800 shadow-inner font-mono text-xs space-y-2">
      <div className="flex justify-between items-center gap-3 border-b border-slate-800 pb-2 mb-2 text-slate-400">
        {/* A heading, not a span: the region had visible text but no name a
            screen reader could navigate to. Tailwind's preflight resets the
            h2's own margins and weight, so this renders identically. */}
        <h2 className="text-xs font-normal">{title}</h2>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label={title}
        className="h-32 overflow-y-auto space-y-1 scrollbar-thin"
      >
        {events.length === 0 ? (
          <p className="text-slate-500">{emptyNote}</p>
        ) : (
          events.map((event, index) => (
            <div key={`${event}-${index}`} className={logTone(event)}>
              {event}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
