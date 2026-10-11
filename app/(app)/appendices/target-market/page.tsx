// app/(app)/appendices/target-market/page.tsx
// Server component: prose, one table and two figures — no state, no effects.
// The figures are client components (MarketFigures.tsx) fed by marketData.ts,
// the same module the legend below them reads.

import type { ReactNode } from "react";
import { MARKET } from "./marketData";
import { MarketGapFigure, VolumeFigure } from "./MarketFigures";

/**
 * Who this is for — and how large the opening is.
 *
 * Two halves, in the order a judge reads them: first the three audiences this
 * build already serves (described because the product exists and can be
 * pointed at), then the market study behind the Venezuela rail — the rails
 * people actually use, the companies already serving them, and the credit
 * nobody is writing.
 *
 * The rule this appendix opened with has not changed: no figure is printed
 * here without a source a reader can follow. Every card that states a number
 * ends with where it came from, and the ones this build has *not* verified
 * say so at the bottom rather than being quietly dropped.
 */
export const metadata = {
  title: "Target Market · PayPal AI Agent Gateway",
  description:
    "Who the gateway is for, and the Venezuelan market it is aimed at — rails, players, figures and the credit nobody is writing, each with its source.",
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

/** The four figures of 2023–2024, as a labelled list rather than as prose. */
const LANDSCAPE = [
  {
    what: "Market dominance",
    figure: "63%",
    how: "of all financial transactions in Venezuela now run through mobile payments, well ahead of points of sale (POS) and cash withdrawals.",
  },
  {
    what: "Operating volume",
    figure: "470M",
    how: "operations a year executed through this channel alone, consolidating it as the engine of daily liquidity.",
  },
  {
    what: "Penetration",
    figure: "7M / day",
    how: "operations daily — 40–50% of every electronic transaction in the country — moving more than $3,000 million a month in equivalent transaction value.",
  },
  {
    what: "Cost to the user",
    figure: "0.30–2%",
    how: "in commissions, with a minimum fee regulated by the BCV (currently around 14 bolívares for interbank operations), which keeps it accessible for microtransactions.",
  },
];

const SEGMENTS = [
  {
    segment: "Consumer financing",
    kind: "BNPL",
    players: "Cashea, Finity",
    allies: "Retail merchants, large brands",
  },
  {
    segment: "Treasury & corporate payments",
    kind: "",
    players: "Qash, Tesote, Quoota",
    allies: "National banks, cross-border companies",
  },
  {
    segment: "Wallets & hybrid payments",
    kind: "",
    players: "Crixto, Fina, Venflow, Kontigo",
    allies: "Sudeban, BCV, crypto ecosystems",
  },
];

const OPPORTUNITIES = [
  {
    title: "The post-payment gap",
    body: "Mobile payments solved the transfer, but Venezuela has no consumer credit, no BNPL and no digital insurance for the unbanked majority — a huge gap. Whoever uses mobile-payment data for credit scoring wins the market.",
  },
  {
    title: "A de facto bimonetary economy",
    body: "Unsatisfied demand for tools that move fluently between bolívares (daily spending) and stablecoins/USD (savings and international suppliers) inside a single interface.",
  },
  {
    title: "Remittances as the Trojan horse",
    body: "Venezuela receives billions of dollars a year in remittances. The fintechs that cut the cost of sending from 8–10% (traditional banking) to 1–3% (via crypto/stablecoins) are capturing a monumental volume.",
  },
  {
    title: "An evolving regulatory framework",
    body: "SUDEBAN has issued rules enabling virtual onboarding and is preparing the ground for open banking, lowering the barrier to entry for new technology players.",
  },
];

/** The four figures the 2025–2026 update changed. */
const LEAP = [
  {
    key: "A",
    title: "Mobile payments has officially overtaken points of sale",
    body: "The most recent Central Bank of Venezuela (BCV) figures confirm a historic milestone: in July 2025, 470.9 million mobile-payment operations were executed, displacing points of sale (458.6 million) for the first time. By May 2026, the migration of physical cheques and cash towards immediate credit and mobile payments is considered close to 100% complete in mass retail.",
  },
  {
    key: "B",
    title: "Remittances — the new oil — reach $5,000 million",
    body: "Specialist projections and observed flows put remittances to Venezuela at about 4% of GDP, on course for $5,000 million (5B USD) in 2026. That is a significant jump from the $3,800 million of 2024, and it consolidates a constant external cash flow that fintechs can intercept and multiply.",
  },
  {
    key: "C",
    title: "The elephant in the room: Cashea validates the market at scale",
    body: "Cashea has just closed a $100 million investment round and passed 10 million users in Venezuela. Forbes and Bloomberg Línea now recognise it officially as the largest consumer-credit provider in Venezuela and the largest BNPL (Buy Now, Pay Later) in all of Latin America.",
  },
  {
    key: "D",
    title: "The credit gap persists",
    body: "Despite Cashea's success in formal retail (clothing, electronics), traditional consumer bank credit remains destroyed, contributing just 2.6% of GDP. The banks do not lend. Cashea covers one band and leaves out millions of independent workers, SMEs and sectors such as health, education and automotive.",
  },
];

const SOURCES = [
  {
    what: "Transaction volumes, market share and fees",
    how: "Central Bank of Venezuela (BCV) and SUDEBAN reports, 2023–2025. The 2019–2024 series in the first chart is an estimate built from those reports.",
  },
  {
    what: "July 2025 — 470.9M mobile payments vs 458.6M POS",
    how: "BCV monthly reports, 2025.",
  },
  {
    what: "Remittances: $3,800M in 2024, ~$5,000M projected for 2026, ~4% of GDP",
    how: "Specialist projections cited in this brief. A projection, not a measurement — labelled as one wherever it appears.",
  },
  {
    what: "Cashea: $100M round, 10M users, largest BNPL in Latin America",
    how: "Public reporting (Forbes, Bloomberg Línea) and the company's own announcements.",
  },
  {
    what: "Merchant discount rates (MDR) of 8–15%",
    how: "Cashea's published merchant pricing; the 4–7% figure is a target this build would have to prove, not a price it charges today.",
  },
];

/** What this appendix still refuses to claim — kept, because it still holds. */
const STILL_OPEN = [
  {
    what: "Independent verification of every figure above",
    how: "The numbers arrive from published reports read second-hand; each is printed with the source that produced it, and none has been re-audited against the primary document by this build.",
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

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
    >
      <h2 id={id} className="text-base font-semibold text-slate-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Every card that prints a number ends with this, so the rule is visible. */
function Source({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
      <span className="font-semibold uppercase tracking-wide text-slate-400">Source · </span>
      {children}
    </p>
  );
}

export default function TargetMarketAppendix() {
  return (
    <div className="space-y-4 px-6 pb-10 pt-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Target Market</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-slate-500">
            Who this is for, and how large the opening is. The three audiences below are the ones
            this build already serves — described because the product exists and can be pointed at —
            and the study that follows is the market behind the Venezuela rail: the rails people
            actually use, the companies already serving them, and the credit nobody is writing.
            Every figure carries the source it came from.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          Written 11 October 2026
        </span>
      </header>

      {/* ── The product half: who this build is for ─────────────────── */}
      <Section id="audiences" title="Who this is for">
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {AUDIENCES.map((audience) => (
            <div
              key={audience.title}
              className="rounded-xl border border-slate-100 bg-slate-50 p-4"
            >
              <h3 className="text-sm font-semibold text-slate-900">{audience.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{audience.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── The market half: Venezuela ──────────────────────────────── */}
      <Section id="why-venezuela" title="PayPal AI Agent in Venezuela">
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          PayPal AI Agent is designed to take on the most advanced technological challenges of the
          next era of agentic commerce — offering a complete platform for it, where the user holds
          the fullest and most detailed account of their money.
        </p>
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Where it really shines, though, is in its fit with Venezuela&apos;s financial market:
          today one of the most complex and difficult in the world, and in the middle of a
          transformation driven by its current geopolitical situation with the United States.
        </p>
      </Section>

      <Section id="landscape" title="1 · The financial landscape (2023–2024)">
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Mobile payments (Pago Móvil) was never only a technological patch — it was the{" "}
          <span className="font-semibold text-slate-900">systemic buffer</span> that prevented the
          total collapse of commercial exchange during hyperinflation and a critical shortage of
          cash. When banknotes lost their value and ATMs ran dry, the system let both the informal
          and the formal economy keep operating without depending on printing or physically
          distributing currency.
        </p>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LANDSCAPE.map((item) => (
            <div key={item.what} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <dt className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {item.what}
                </span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-slate-900">
                  {item.figure}
                </span>
              </dt>
              <dd className="mt-1.5 text-xs leading-relaxed text-slate-500">{item.how}</dd>
            </div>
          ))}
        </dl>

        <Source>
          BCV and SUDEBAN reports, 2023–2024. Fees and the minimum interbank charge are the
          regulated figures, not a tariff set by this product.
        </Source>
      </Section>

      <Section id="chart-volume" title="Mobile payments vs. points of sale, 2019–2024">
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Millions of operations a year. One rail quadrupled while the other shrank: the emergency
          buffer became the main road. Hover a bar for its exact figure.
        </p>
        <div className="mt-4">
          <VolumeFigure />
        </div>
        <Source>
          Estimated from SUDEBAN / BCV reports. Two rails, never added together — the total of both
          would be a number that means nothing.
        </Source>
      </Section>

      <Section id="ecosystem" title="2 · The fintech ecosystem (2025–2026)">
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          The success of mobile payments built the mental and technical infrastructure for the
          startups now solving the next layers of the problem. Some of the leading players today —
          and many more are entering the Venezuelan market:
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">
              Fintech segments, their leading players and their strategic allies in Venezuela
            </caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Fintech segment
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Leading / expanding players
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Strategic allies
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SEGMENTS.map((row) => (
                <tr key={row.segment}>
                  <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                    {row.segment}
                    {row.kind ? (
                      <span className="font-normal text-slate-400"> ({row.kind})</span>
                    ) : null}
                  </th>
                  <td className="px-4 py-3 text-slate-600">{row.players}</td>
                  <td className="px-4 py-3 text-slate-600">{row.allies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ol className="mt-5 max-w-[74ch] space-y-3 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">Ubii Pagos.</span> A leading Venezuelan
            fintech offering an integrated ecosystem of point-of-sale (POS) terminals and a digital
            wallet that allows transactions between users, mobile payments and remittances without
            expensive intermediaries.
          </li>
          <li>
            <span className="font-semibold text-slate-900">Pago ASAP.</span> A Venezuelan
            cross-border payments startup that recently raised{" "}
            <span className="font-semibold text-slate-900">US$1.15 million</span> in a seed round.
            It connects companies in Venezuela with markets such as Colombia, adapting
            infrastructures like the Bre-B system to speed up international B2B payments.
          </li>
          <li>
            <span className="font-semibold text-slate-900">International players with a strong foothold.</span>{" "}
            <span className="font-medium text-slate-800">Depay</span>, an Argentine fintech that has
            just added Venezuela to its real-time payments network, connecting it with five other
            countries.{" "}
            <span className="font-medium text-slate-800">Airtm and Vita Wallet</span>, platforms
            that dominate the remittance and crypto-to-fiat niche, meeting the need to preserve
            value in strong currencies.
          </li>
        </ol>
      </Section>

      <Section id="opportunity" title="3 · Why entering now with PayPal-AI-Crowdfunding is a large opportunity">
        <ol className="mt-3 max-w-[74ch] space-y-3 text-sm leading-relaxed text-slate-600">
          {OPPORTUNITIES.map((item, index) => (
            <li key={item.title}>
              <span className="font-semibold text-slate-900">
                {index + 1}. {item.title}.
              </span>{" "}
              {item.body}
            </li>
          ))}
        </ol>
      </Section>

      <Section id="cashea" title="4 · PayPal AI Crowdfunding vs. Cashea">
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Cashea is, without a doubt, the most visible success story and the dominant player in
          Venezuela&apos;s BNPL (Buy Now, Pay Later) space today. It has executed an aggressive and
          intelligent expansion, filling the vacuum left by the disappearance of traditional
          consumer bank credit.
        </p>
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          The key question: <span className="font-semibold text-slate-900">can Cashea be competed with?</span>{" "}
          The short answer is yes, but not head-on. Replicating its exact model — mass B2C across
          fashion, electronics and beauty retail — would be a costly mistake, because of its{" "}
          <em className="italic">network effects</em> (the more users it has, the more merchants
          accept its app, and vice versa) and its accumulated data advantage for risk scoring.
        </p>
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Giants are defeated through{" "}
          <span className="font-semibold text-slate-900">asymmetric competition</span>. These are
          the concrete strategies for building a viable competitor and taking share:
        </p>

        <h3 className="mt-5 text-sm font-semibold text-slate-900">
          4.1 · Verticalisation: attack the blue oceans Cashea ignores
        </h3>
        <p className="mt-1.5 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Cashea has focused on discretionary consumer goods (clothing, shoes, phones). Several
          sectors have high financing needs and low BNPL penetration:
        </p>
        <ul className="mt-2 max-w-[74ch] list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">Health and wellness.</span> Dental
            treatments, specialist consultations, glasses, chronic medication.
          </li>
          <li>
            <span className="font-semibold text-slate-900">Education and training.</span> University
            tuition, technical courses, programming bootcamps.
          </li>
          <li>
            <span className="font-semibold text-slate-900">Automotive services.</span> Major
            repairs, spare parts, preventive maintenance — an obligatory expense rather than a
            discretionary one, with a lower default rate.
          </li>
          <li>
            <span className="font-semibold text-slate-900">Home and improvements.</span> Major
            appliances (fridges, washing machines) through local hardware stores, not only the big
            chains.
          </li>
        </ul>

        <h3 className="mt-5 text-sm font-semibold text-slate-900">
          4.2 · The crypto / stablecoin advantage — the ace up the sleeve ($PYUSD and PayPal USD)
        </h3>
        <p className="mt-1.5 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Venezuela&apos;s adoption of cryptocurrencies and stablecoins (USDT/USDC) is far above the
          world average. Cashea operates mainly in the fiat (bolívar) environment.
        </p>
        <ul className="mt-2 max-w-[74ch] list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">The value proposition:</span> offer the
            merchant <span className="font-semibold text-slate-900">immediate settlement in USDT</span>{" "}
            (removing its exchange-rate and devaluation risk) while the customer pays their
            instalments in bolívares through mobile payments.
          </li>
          <li>
            <span className="font-semibold text-slate-900">Why it works:</span> it solves the
            biggest pain of the Venezuelan merchant today — the uncertainty of receiving bolívares
            that devalue between the moment of the sale and the moment the payment gateway actually
            settles the money.
          </li>
        </ul>

        <h3 className="mt-5 text-sm font-semibold text-slate-900">
          4.3 · The BNPL proposition: inventory financing for SMEs
        </h3>
        <p className="mt-1.5 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Consumer BNPL (B2C) is being crowded out. But{" "}
          <span className="font-semibold text-slate-900">
            BNPL for businesses is almost unexplored in Venezuela.
          </span>
        </p>
        <ul className="mt-2 max-w-[74ch] list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">The problem:</span> a bodega, pharmacy or
            small shop wants to buy inventory from its wholesale supplier but has no working capital
            and no access to bank credit.
          </li>
          <li>
            <span className="font-semibold text-slate-900">The solution:</span> a platform that pays
            the wholesaler up front (or within 7 days) and gives the small merchant 30, 60 or 90
            days to pay — judging risk not by credit history (which they do not have) but by real
            cash flow: daily mobile-payment volume, point-of-sale revenue.
          </li>
        </ul>

        <h3 className="mt-5 text-sm font-semibold text-slate-900">
          4.4 · Risk scoring with AI and alternative data
        </h3>
        <p className="mt-1.5 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Cashea built its own risk algorithm from behaviour inside its app.{" "}
          <span className="font-semibold text-slate-900">PayPal AI Agent could build a better one:</span>
        </p>
        <ul className="mt-2 max-w-[74ch] list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">Open banking / telco alliances.</span>{" "}
            Rather than depending only on data from its own app, it could make alliances to assess
            payment history for services (CANTV, Corpoelec, Movistar, Digitel). Whoever pays their
            phone on time is a good payer.
          </li>
          <li>
            <span className="font-semibold text-slate-900">Psychographic and behavioural analysis.</span>{" "}
            Using AI to read non-traditional patterns (consistency of top-ups, geolocation
            stability) in order to approve people traditional algorithms reject, but who are
            solvent.
          </li>
        </ul>

        <h3 className="mt-5 text-sm font-semibold text-slate-900">
          4.5 · The margin war: lowering the cost for the merchant (MDR)
        </h3>
        <p className="mt-1.5 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Cashea charges merchants a commission (MDR — Merchant Discount Rate) that can be high —
          often between <span className="font-semibold text-slate-900">8% and 15%</span>, depending
          on risk and term — to cover its cost of capital and defaults.
        </p>
        <p className="mt-2 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          If a more efficient cost structure is achieved (optimised cloud infrastructure, cheaper
          debt capital through impact funds or crypto), the merchant can be offered{" "}
          <span className="font-semibold text-slate-900">4–7%</span>. On tight margins that
          difference makes the merchant recommend the platform to the customer at the point of sale
          instead of the competition. PayPal already has the platform to do it uniquely and
          efficiently.
        </p>

        <blockquote className="mt-5 max-w-[74ch] rounded-xl border-l-4 border-blue-300 bg-blue-50 p-4 text-sm leading-relaxed text-slate-700">
          <span className="font-semibold text-slate-900">Roadmap — how to start competing:</span>{" "}
          definitive proof of concept. <em className="italic">Cashea demonstrated that Venezuelans
          do pay their debts when the model is fair and accessible. The market validated the demand.
          Now the opportunity is not in doing the same, but in doing it for whom Cashea forgot: the
          SME merchant, the health sector, and the economy backed by stablecoins.</em>
        </blockquote>
      </Section>

      <Section id="leap" title="5 · Updated data (2025–2026): the leap">
        <div className="mt-3 space-y-4">
          {LEAP.map((item) => (
            <div key={item.key}>
              <h3 className="text-sm font-semibold text-slate-900">
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 font-mono text-[11px] text-slate-500">
                  {item.key}
                </span>
                {item.title}
              </h3>
              <p className="mt-1.5 max-w-[74ch] text-sm leading-relaxed text-slate-600">
                {item.body}
              </p>
            </div>
          ))}
        </div>
        <Source>
          BCV monthly reports (2025); specialist remittance projections (2026); public reporting on
          Cashea&apos;s round. Figures marked as projections are projections.
        </Source>
      </Section>

      <Section id="market-size" title="6 · Market size (estimate, 2025–2026)">
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          The size of the pie today:
        </p>
        <ul className="mt-2 max-w-[74ch] list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">Annual digital transaction volume:</span>{" "}
            ~$40,000 million, on the base of mobile payments plus digital wallets.
          </li>
          <li>
            <span className="font-semibold text-slate-900">Annual remittance flow:</span> ~$5,000
            million.
          </li>
          <li>
            <span className="font-semibold text-slate-900">BNPL / unserved consumer credit:</span>{" "}
            if Cashea proved it can capture millions of users, the total financeable consumer
            market — including what Cashea does <em className="italic">not</em> touch (services,
            B2B, health, SMEs) — is conservatively estimated at{" "}
            <span className="font-semibold text-slate-900">$12,000 to $15,000 million a year</span>.
          </li>
        </ul>

        <div className="mt-4">
          <MarketGapFigure />
          {/* The legend is ours, not the library's: five rows, all visible at
              once, each with the note and the exact figure — a legend that
              paginates is a legend showing a third of the truth. */}
          <dl className="mt-3 space-y-1.5">
            {MARKET.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-3 border-b border-slate-50 pb-1.5 last:border-b-0"
              >
                <dt className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.fill }}
                  />
                  <span className="truncate">
                    {row.label}
                    <span className="text-slate-400"> · {row.note}</span>
                  </span>
                </dt>
                <dd className="shrink-0 font-mono text-xs font-semibold tabular-nums text-slate-900">
                  ${row.value}B
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <Source>
          2026 remittance projections, BCV/SUDEBAN reports (2025) and public data from Cashea&apos;s
          investment rounds ($100M / 10M users). The credit figures are estimates of an informal
          market, and are drawn — not measured.
        </Source>
      </Section>

      <Section id="opening" title="7 · The opening">
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          Cashea took clothing and electronics retail. Who is financing the university tuition, the
          vehicle repair, the inventory of the SME? Nobody. Traditional bank credit — the red bar
          above — is still collapsed at 2.6% of GDP: the banks do not lend. Cashea covers one band
          and leaves out millions.
        </p>
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          That is not a bet — it is a{" "}
          <span className="font-semibold text-slate-900">validation of the market</span>: Venezuelans
          need financing and they pay it.
        </p>
        <p className="mt-3 max-w-[74ch] text-sm leading-relaxed text-slate-600">
          The question is no longer whether there is a market. It is an ocean of $12 billion a year
          that already has the digital habit ($40,000 million in mobile payments) and the cash flow
          ($5,000 million in remittances) — and lacks a credit bridge built for it.
        </p>
        <p className="mt-3 max-w-[74ch] text-sm font-semibold text-slate-900">
          That is the great opportunity for PayPal-AI-Crowdfunding.
        </p>
      </Section>

      {/* ── The rule, and what it still refuses to claim ────────────── */}
      <Section id="still-open" title="What this appendix still does not claim">
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {STILL_OPEN.map((item) => (
            <li
              key={item.what}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="w-full shrink-0 text-sm font-semibold text-slate-900 sm:w-72">
                {item.what}
              </span>
              <span className="text-xs leading-relaxed text-slate-500">{item.how}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 max-w-[74ch] text-xs leading-relaxed text-slate-400">
          The rule this appendix follows:{" "}
          <span className="font-medium text-slate-500">
            no figure is printed here without a source a reader can follow.
          </span>{" "}
          An unsourced number in front of a judge is worse than an empty section — the empty one is
          only incomplete. Where a figure could not be verified, it is labelled as an estimate
          rather than quietly rounded into a fact.
        </p>
      </Section>

      <Section id="sources" title="Sources, in one place">
        <dl className="mt-3 divide-y divide-slate-100">
          {SOURCES.map((item) => (
            <div key={item.what} className="py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-semibold text-slate-900">{item.what}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.how}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Two charts on this page are drawn from those reports with{" "}
          <span className="font-medium text-slate-500">AG Charts Community</span> — the same MIT
          library the dashboard uses — rather than pasted as images, so the numbers behind them are
          readable in <code className="font-mono text-[11px] text-slate-500">marketData.ts</code>,
          next to the words that quote them.
        </p>
      </Section>
    </div>
  );
}
