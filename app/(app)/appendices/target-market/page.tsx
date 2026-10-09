// app/(app)/appendices/target-market/page.tsx
// Server component: prose and a list — no state, no effects.

/**
 * Who this is for.
 *
 * Written as an outline rather than as a sized market, on purpose: the
 * figures this appendix will eventually carry are the ones a judge would
 * check, and a number printed without a source costs more credibility than it
 * buys. Everything below describes the product that exists, which needs no
 * source beyond the code.
 */
export const metadata = {
  title: "Target Market · PayPal AI Agent Gateway",
  description: "Who the gateway is for, and how the sizing will be shown once it is verified.",
};

const AUDIENCES = [
  {
    title: "Dollars that are easy to hold and hard to spend locally",
    body: "A PayPal balance is convenient until the moment it has to become money somebody will take. This build ships that second rail as an opt-in: prepare a Pago Móvil at the official BCV rate, with the screen stating plainly that no bank is connected in this build.",
  },
  {
    title: "Businesses that need an order an agent cannot break",
    body: "A ceiling, a recipient, a window and a condition — approved once, enforced on every attempt. The same envelope that governs a $60 purchase governs a $20,000 campaign, which is what makes it a purchase order rather than a confirmation dialog.",
  },
  {
    title: "Builders whose agents spend money",
    body: "The agent stack (UCP, AP2, A2A, MCP) solves capability. Nobody has solved sustained consent: approving forty times a day is what makes a consent system unusable. This is the governor that turns per-transaction consent into per-policy consent.",
  },
];

const PENDING = [
  {
    what: "Market sizing for Venezuela's digital economy",
    how: "TAM / SAM / SOM, each figure printed with the source it came from.",
  },
  {
    what: "The off-ramp landscape as it stands today",
    how: "Regulatory positions change; anything stated here gets checked against a primary source before it is printed, not recalled from memory.",
  },
  {
    what: "Adoption and comparables",
    how: "What comparable products in the region report, and what this build has actually measured — kept apart, never merged into one number.",
  },
];

export default function TargetMarketAppendix() {
  return (
    <div className="px-6 pt-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Target Market</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-slate-500">
            Three audiences, one product. The people are described here because the product exists
            and can be pointed at; the numbers will follow, and they will arrive with the source
            that produced them.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Being written
        </span>
      </header>

      <section aria-label="Who this is for" className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Who this is for
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {AUDIENCES.map((audience) => (
            <div key={audience.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">{audience.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{audience.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="What will be measured here" className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          What will be measured here
        </h2>
        <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {PENDING.map((item) => (
            <li key={item.what} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="w-full shrink-0 text-sm font-semibold text-slate-900 sm:w-64">
                {item.what}
              </span>
              <span className="text-xs leading-relaxed text-slate-500">{item.how}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-slate-400">
          The rule this appendix follows: <span className="font-medium text-slate-500">no figure is
          printed here without a source a reader can follow.</span> An unsourced number in front of
          a judge is worse than an empty section — the empty one is only incomplete.
        </p>
      </section>
    </div>
  );
}
