// app/(app)/crowdfunding/PortfolioCard.tsx
"use client";

/**
 * What *you* hold — the sub-section under the title, so the answer to "what do
 * I have?" is above the fold rather than below the catalogue of things you
 * could have.
 *
 * Empty today, and empty in a way that says why: no investment can exist until
 * the payment step does, so the three figures read $0 with a sentence that
 * names what fills them. A portfolio that showed sample positions instead
 * would be reporting money this product has never received — the one lie a
 * financial screen may not tell.
 *
 * The structure is the commitment: invested, earning, projects. When F3.5
 * lands, the same three cells start carrying real numbers and nothing else
 * about the layout has to change.
 */
export default function PortfolioCard() {
  const stats: Array<{ label: string; value: string; note: string }> = [
    { label: "Invested", value: "$0", note: "across 0 projects" },
    { label: "Earning now", value: "$0.00", note: "per day, in dollars" },
    { label: "Projects", value: "0", note: "you are in" },
  ];

  return (
    <section
      aria-label="Your investments"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Your investments</h2>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Nothing yet
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {stat.label}
            </p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-slate-900">
              {stat.value}
            </p>
            <p className="text-[11px] text-slate-400">{stat.note}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">Nothing invested yet.</span> These three
        figures fill the moment you fund a project below: what you put in, what it is earning today,
        and how many businesses you are behind. Sample positions would report money this product has
        never received, so the screen shows none.
      </p>
    </section>
  );
}
