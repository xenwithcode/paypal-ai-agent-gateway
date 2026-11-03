// app/(app)/overview/components/StartHere.tsx
"use client";

import { useEffect, useState } from "react";
import { PenLine, ClipboardCheck, ShieldCheck, X } from "lucide-react";

/**
 * The three sentences this page owes somebody who has never seen it.
 *
 * The dashboard is an operator's console, and it was written as one: an input
 * asking for a *ceiling* and a *condition*, a 560-pixel table of orders, and
 * a console that narrates in the product's own vocabulary. All of it correct,
 * none of it an entrance. A judge opening `/overview` cold had to reverse
 * engineer what they were looking at from the parts, which is time the page
 * cannot assume they have and attention the thesis cannot spare.
 *
 * So: the thesis in one sentence, its three steps beneath it, above
 * everything else — and gone after one read. The dismissal is remembered in
 * `localStorage` rather than being
 * session state, because a strip that comes back on every reload is an
 * advertisement, and the one-liner left behind brings it back on purpose.
 *
 * Rendered on the client and mounted only once the memory can be read: the
 * first paint has to agree between the server and the browser, and a
 * component that guessed at `localStorage` during render would paint the
 * strip on the server and nothing after hydration.
 */
const STORAGE_KEY = "ppa:seen-start-here";

const STEPS = [
  {
    icon: PenLine,
    title: "Say what the agent may buy",
    body: "In plain words, or by voice. No syntax to learn — the sentence is the request.",
  },
  {
    icon: ClipboardCheck,
    title: "It drafts a purchase order",
    body: "A ceiling, a recipient, a window and a condition — the envelope the agent cannot cross.",
  },
  {
    icon: ShieldCheck,
    title: "You approve it in PayPal",
    body: "Money moves in PayPal's own UI, and only when the condition holds. Never before.",
  },
] as const;

/**
 * The three steps a first-time visitor gets, and the one-line re-open
 * everybody else does.
 *
 * A judge is rarely a first-time visitor: they have opened the app before,
 * on somebody else's laptop, and the strip they remember is the one they
 * dismissed — so the way back stays visible in the seen state rather than
 * being a second strip that has to fight for the same attention.
 */
export default function StartHere() {
  // `undefined` until the browser has answered, so the first render never
  // guesses: the strip and the one-liner are the same element's two states.
  const [seen, setSeen] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    try {
      setSeen(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Private mode or a blocked storage: treat as seen, so the page is not
      // permanently annotated for a reader who cannot dismiss it.
      setSeen(true);
    }
  }, []);

  const dismiss = () => {
    setSeen(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // The strip is dismissed for this visit either way.
    }
  };

  // Still unknown on the very first client render: render nothing rather
  // than the wrong one of the two states. Showing the one-liner for a frame
  // before the strip replaces it would be the page changing its mind in
  // front of the reader.
  if (seen === undefined) return null;

  // Already read: one line, no furniture.
  if (seen) {
    return (
      <div className="flex items-center justify-end gap-4">
        <button
          onClick={() => setSeen(false)}
          className="text-xs font-medium text-slate-400 underline-offset-2 transition hover:text-slate-600 hover:underline"
        >
          How this works — the three steps ↺
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="How this page works"
      // It breathes, once, for as long as it is on screen: the strip's whole
      // job is to be read by somebody who has never seen this page, and a
      // strip that waits politely to be noticed is a strip a judge scrolls
      // past. A soft ring of the brand blue — not a flash — off the moment
      // the mouse arrives (the reader is reading now) and off entirely under
      // `prefers-reduced-motion`, the same courtesy the diagram's Live mode
      // gives. Gone forever after the ✕, remembered in localStorage.
      className="animate-soft-glow rounded-2xl border border-blue-100 bg-blue-50/60 p-4 motion-reduce:animate-none hover:animate-none md:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          New here? This is the whole idea, in three steps
        </p>
        <button
          onClick={dismiss}
          aria-label="Hide the three steps"
          className="shrink-0 rounded-lg p-1 text-blue-400 transition hover:bg-blue-100 hover:text-blue-700"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {/* The moat, said once, above the steps that prove it: the one
          sentence a visitor should be able to repeat after closing the tab.
          The verb order *is* the argument — prepares, approves, pays: three
          different places, and only the last one holds money. */}
      <p className="mt-2 text-sm font-semibold italic text-slate-700">
        The agent prepares. You approve. Our server pays.
      </p>

      <ol className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-mono text-[11px] font-bold text-white">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-blue-600" strokeWidth={2} aria-hidden="true" />
                  {step.title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                  {step.body}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
