// app/(app)/components/EventConsole.tsx
"use client";

import type { ReactNode } from "react";
import { logTone } from "@/lib/events";

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
 * The name of the console, owned by the component.
 *
 * It used to be a prop, and that is how one console ended up with two names:
 * Overview took the default (`… (UCP & Gateway stream)`) while Recurring
 * overrode it with the short one — for the *same* record, written by the
 * dashboard and read by both. Two names for one stream invites a reader to
 * conclude there are two logs, which is the confusion Fase 12 existed to
 * remove.
 *
 * The suffix also named UCP in a header, where nothing implements it: the
 * protocol is a narrative decision, not a feature, and the lines already say
 * who spoke — `🧠`, `🤖`, `📄`, `❌`. A title earns its place by contrasting
 * with another title, and there is no other console to contrast with.
 *
 * Not configurable on purpose. A third surface that wants its own wording is
 * how this came back; if a section ever genuinely runs a *different* stream,
 * that is when it gets a name — one definition, not three.
 */
const TITLE = "🖥️ Agentic Event Console";

export default function EventConsole({
  events,
  actions,
  emptyNote = "Nothing yet.",
}: {
  events: string[];
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
        <h2 className="text-xs font-normal">{TITLE}</h2>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label={TITLE}
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
