// app/(app)/appendices/final-notes/page.tsx
// Server component: prose only — no state, no effects.

/**
 * The closing page: what is real, what is not, and what is left.
 *
 * A project whose whole argument is honesty should end on the same
 * distinction it opens with. Nothing here is written to sound finished —
 * every item says which of the three it is.
 */
export const metadata = {
  title: "Final Notes · PayPal AI Agent Gateway",
  description: "What is real, what is simulated, what is deliberately not built, and what is left.",
};

const REAL = [
  {
    what: "Money, in the sandbox",
    how: "Orders are created, authorized and captured against a live PayPal sandbox account — real ids, real authorization expiry, real refusals.",
  },
  {
    what: "The exchange rate",
    how: "Read from the official BCV feed. If it cannot be reached the app raises instead of converting at a plausible number.",
  },
  {
    what: "The model, in two voices",
    how: "Gemini for the typed intent and Gemini Live for speech; both call tools that the browser executes through the same handlers the buttons use.",
  },
  {
    what: "The judge",
    how: "Ceiling, window, recipient, autonomy, and a campaign's band and goal are decided on the server, before PayPal is asked for anything.",
  },
];

const SIMULATED = [
  {
    what: "The product catalogue",
    how: "Labelled `demo-catalog` on the page. No free source of real prices exists; pretending one does is the kind of claim this project refuses.",
  },
  {
    what: "The four funding campaigns",
    how: "Labelled `demo` on every row: real coordinates and real structure, no audit behind them.",
  },
  {
    what: "The console",
    how: "Deterministic where nothing was actually performed — a line is printed only when something ran, and a refusal prints the refusal.",
  },
];

const LEFT = [
  {
    what: "Standing consent (level 3)",
    how: "Charging later without asking again, through PayPal's own Billing Agreement, inside ceilings and revocable in one action. Designed in SECURITY.md, deliberately not shown as built.",
  },
  {
    what: "Authentication",
    how: "The file store and the API are localhost-only. Required before this is exposed to the internet — same roadmap item as public hosting.",
  },
  {
    what: "The public release",
    how: "Hosted on Google Cloud, with the architecture diagram refreshed, the repository made public, and Enterprise-only features licence-gated so they fall back cleanly for anyone running without a key.",
  },
];

export default function FinalNotesAppendix() {
  return (
    <div className="px-6 pt-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Final Notes</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-slate-500">
            What this build actually does, what it only simulates, what it refuses to pretend it
            has built, and what is left to do. Three lists, kept apart — because the difference
            between them is the whole argument of the product.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Being written
        </span>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <List title="What is real" items={REAL} tone="emerald" />
        <List title="What is simulated" items={SIMULATED} tone="slate" />
        <List title="What is not built yet" items={LEFT} tone="amber" />
      </div>

      <p className="mt-6 max-w-[70ch] text-sm leading-relaxed text-slate-600">
        The line this product opens with, and the one it closes on:{" "}
        <span className="font-semibold text-slate-900">
          the agent requests, the server judges, the human approves.
        </span>{" "}
        Everything above is an attempt to make that true in code rather than in a diagram — and to
        say out loud where it is not true yet.
      </p>
    </div>
  );
}

function List({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly { what: string; how: string }[];
  tone: "emerald" | "slate" | "amber";
}) {
  const dot =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-slate-400";

  return (
    <section
      aria-label={title}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        {title}
      </h2>
      <dl className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.what}>
            <dt className="text-xs font-semibold text-slate-800">{item.what}</dt>
            <dd className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{item.how}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
