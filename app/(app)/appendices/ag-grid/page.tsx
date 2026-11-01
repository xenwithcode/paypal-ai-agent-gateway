// app/(app)/appendices/ag-grid/page.tsx
// Server component: a served diagram, a table and prose — no state, no charts.

/**
 * The sponsor's appendix — and the page that carries what the video could not.
 *
 * AG Grid is a hackathon sponsor, and every table and figure in this product
 * is built on its grid and its charts. Two things had to be true here:
 * the judges could see *which* widget renders *which* data and where it
 * comes from (the hackathon asks for work "sufficiently documented for the
 * judges to understand and evaluate it"), and the one card the three-minute
 * video had no room for — *Where the money went* — had a home.
 *
 * The diagram is a standalone Archify page served from `public/architecture/`
 * rather than re-drawn here, for the same reason App Architecture does it that
 * way: re-implementing it as JSX would be a second diagram to keep in step
 * with the first, and the whole value of this appendix is that what is on
 * screen came out of the repository.
 *
 * Every row of the table below was read out of the component that renders it —
 * not from memory — and where a widget does *not* use a chart library, the
 * table says so instead of flattering it.
 */
export const metadata = {
  title: "AG Grid & Charts · PayPal AI Agent Gateway",
  description:
    "How the gateway's rows reach every AG Grid table and AG Charts figure — which widget renders which data, where each number comes from, and the Activity card the three-minute video had no room for.",
};

/** Served, not imported: see the note in README about where Archify writes. */
const DIAGRAM = "/architecture/grid-data-flow.html";

/** When the diagram was generated — stated, because a diagram ages silently. */
const GENERATED = "1 November 2026";

/**
 * Every widget that renders this product's data.
 *
 * Read from the components themselves on 1-nov: what library each one uses
 * (`ag-grid-react` / `AgCharts`), which screen mounts it, and which function
 * produces the numbers it draws.
 */
const WIDGETS: readonly {
  widget: string;
  screen: string;
  library: string;
  feeds: string;
}[] = [
  {
    widget: "AgentGrid",
    screen: "/overview",
    library: "AG Grid",
    feeds: "Policy rows — every order, with the server's verdict already applied",
  },
  {
    widget: "Money in flight",
    screen: "/overview",
    library: "AG Charts",
    feeds: "`lib/moneyInFlight` sums those same rows by state; a click opens the rows it summed",
  },
  {
    widget: "JsonGrid",
    screen: "/activity",
    library: "AG Grid",
    feeds: "Ledger entries typed into columns by `lib/gridColumns`",
  },
  {
    widget: "Where the money went",
    screen: "/activity",
    library: "its own bars — not a chart library",
    feeds: "`lib/activityByType` over the policy rows, one entry per currency",
  },
  {
    widget: "ProjectGrid",
    screen: "/crowdfunding",
    library: "AG Grid",
    feeds: "The shipped campaign seed, normalised before the grid ever sees it",
  },
  {
    widget: "PortfolioDonut",
    screen: "/crowdfunding",
    library: "AG Charts",
    feeds: "Pledges by state: paid, reserved, returned",
  },
  {
    widget: "FutureValue",
    screen: "/crowdfunding",
    library: "AG Charts",
    feeds: "Committed money at the campaign's own offered rate — never a rate invented here",
  },
  {
    widget: "MarketFigures",
    screen: "/appendices/target-market",
    library: "AG Charts",
    feeds: "The market figures cited in the target-market appendix",
  },
];

/** The three books the Activity card sums. Labels are the component's own. */
const BOOKS: readonly { book: string; sums: string }[] = [
  { book: "Purchases", sums: "orders that settled — money that completed" },
  { book: "Transfers", sums: "money sent to a person" },
  { book: "Investments", sums: "stakes in crowdfunding campaigns" },
];

export default function AGGridAppendix() {
  return (
    <div className="px-6 pt-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">AG Grid &amp; Charts</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-slate-500">
            Every table and every figure in this product is drawn by AG Grid&apos;s grid or its
            charts, and each one of them reads rows this gateway produced — an order the server
            already judged, a ledger entry PayPal confirmed, a campaign that shipped with the
            app. This page names the widget, the screen, and the function that makes its numbers,
            and then carries the one card the three-minute video had no room for. The diagram was
            generated from this repository with <span className="font-medium text-slate-700">Archify</span>{" "}
            and is served as-is: the file you see is the artifact, not a re-drawing of it.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          Generated {GENERATED}
        </span>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <iframe
          title="How the gateway's data reaches AG Grid and AG Charts"
          src={DIAGRAM}
          className="h-[78vh] w-full border-0 bg-white"
        />
      </div>

      <p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-slate-400">
        🎬 <span className="font-medium text-slate-500">It moves.</span> Hover any box to watch what
        travels along its edges; press <span className="font-medium text-slate-500">Live</span>{" "}
        (top right of the diagram) and the flow runs on its own. A diagram that looks still is
        honouring your system&apos;s <em>reduce motion</em> setting — the toggle is disabled while
        that is on, which is deliberate.
      </p>

      {/* ── The table ─────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-lg font-bold text-slate-900">Which widget renders what</h2>
        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-slate-500">
          Read from the components themselves, not from memory. Where a widget is not a chart
          library&apos;s, the row says so rather than flattering it.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[46rem] border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="px-3 py-2 font-semibold">Widget</th>
                <th className="px-3 py-2 font-semibold">Screen</th>
                <th className="px-3 py-2 font-semibold">Drawn with</th>
                <th className="px-3 py-2 font-semibold">Fed by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {WIDGETS.map((row) => (
                <tr key={row.widget}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">
                    {row.widget}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-500">
                    {row.screen}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{row.library}</td>
                  <td className="px-3 py-2 leading-relaxed">{row.feeds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-[74ch] text-xs leading-relaxed text-slate-400">
          Two names worth keeping apart: <span className="font-medium text-slate-500">Money in
          flight</span> lives on <span className="font-mono">/overview</span> — it is mounted inside
          AgentGrid — while <span className="font-medium text-slate-500">Where the money went</span>{" "}
          is the first card on <span className="font-mono">/activity</span>. Neither is the other;
          the video&apos;s time made only the first one visible.
        </p>
      </section>

      {/* ── The card the video had no room for ─────────────────────────── */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          Where the money went — the card the three-minute video had no room for
        </h2>
        <p className="mt-2 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          The submission video spends every second it has on the argument: an agent that asks to
          spend, a server that refuses what breaks the envelope, a human who approves inside
          PayPal. There was no second left for the first card on{" "}
          <span className="font-mono text-xs">/activity</span>, and the hackathon asks for work{" "}
          <em>&ldquo;sufficiently documented for the judges to understand and evaluate it&rdquo;</em>{" "}
          — so the card is documented here, with the function that produces its numbers.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">What it answers</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              <em>Adónde se fue el dinero</em> — where the money that actually moved went, asked
              <em> before</em> the ledger asks to be read. Three books, each with its total and a
              bar for its size:
            </p>
            <table className="mt-2 w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-1 pr-3 font-semibold">Book</th>
                  <th className="py-1 font-semibold">Sums</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {BOOKS.map((row) => (
                  <tr key={row.book}>
                    <td className="py-1.5 pr-3 font-semibold text-slate-900">{row.book}</td>
                    <td className="py-1.5 leading-relaxed">{row.sums}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800">Where the number comes from</h3>
            <ul className="mt-1 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-slate-600">
              <li>
                <span className="font-mono text-xs">activityByType(readPolicyRows())</span> — the
                card sums the policy rows the browser holds, by kind.
              </li>
              <li>
                <strong>One bar per currency.</strong>100 USD and 100 PYUSD are not 200 of
                anything, so they are never added — the axis stays honest.
              </li>
              <li>
                <strong>Deliberately one colour.</strong> The palette already means things —
                green settled, grey returned, amber running out of room — so a second palette
                would teach a vocabulary the rest of the product does not speak.
              </li>
              <li>
                Money held and money given back are counted in <em>Money in flight</em> and in the
                portfolio, not here twice: counting them again would report the same dollars in
                two stories.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Licence, stated the way the sponsor stated it ──────────────── */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-bold text-slate-900">The licence, stated plainly</h2>
        <p className="mt-1 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          This build runs on AG Grid&apos;s trial licence, and AG Studio — the dashboard product —
          is read by the config but not wired to a screen yet. In AG Grid&apos;s own hackathon
          briefing: <em>&ldquo;if you don&apos;t have an API key, we won&apos;t penalize you for
          that in the judging&rdquo;</em>. The grid and the charts here are the Community and
          trial features the app actually uses; nothing on any screen needs an Enterprise feature
          that would silently vanish without a key.
        </p>
      </section>
    </div>
  );
}
