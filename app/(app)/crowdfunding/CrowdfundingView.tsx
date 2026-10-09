// app/(app)/crowdfunding/CrowdfundingView.tsx
"use client";

import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import EmptyState from "../components/EmptyState";
import ProjectGrid from "./ProjectGrid";
import PortfolioCard from "./PortfolioCard";
import VenezuelaMap from "./VenezuelaMap";
import { MAX_INVESTMENT_USD, MIN_INVESTMENT_USD, statusOf, type Project } from "@/lib/crowdfunding";
import { convert, formatAsOf, formatSmart, type FxSnapshot } from "@/lib/fx/rates";

/**
 * The showcase: pick a project, see what $20 costs in bolívares today.
 *
 * Two steps of the four the design describes — the catalogue and the
 * selection — and the second one answers the question that decides the click:
 * *how much is that in my money, at the official rate, right now*. The rate is
 * read from `/api/fx`, the same BCV feed the rest of the app uses, so the
 * conversion here and the one in the Pago Móvil panel cannot disagree.
 *
 * What is deliberately absent: photographs of businesses we have never been
 * inside. The seed is marked `demo` on every row, and an image of somebody
 * else's shop would say something no amount of labelling could walk back.
 */

const PILL_AMOUNTS = [20, 50, 100];

export default function CrowdfundingView({ projects }: { projects: Project[] }) {
  const [selected, setSelected] = useState<Project | null>(null);
  const [amount, setAmount] = useState("20");
  const [rates, setRates] = useState<FxSnapshot | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fx");
        if (!res.ok) throw new Error(res.status === 503 ? "rate feed unavailable" : `HTTP ${res.status}`);
        const data = (await res.json()) as FxSnapshot;
        if (!cancelled) setRates(data);
      } catch (error) {
        if (!cancelled) setRatesError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = Number(amount);
  // Both ends of the band are checked here, where the number is typed, and
  // again by the server when it matters — an `max` attribute is a suggestion
  // the field can be edited past.
  const belowMinimum = Number.isFinite(value) && value > 0 && value < MIN_INVESTMENT_USD;
  const aboveMaximum = Number.isFinite(value) && value > MAX_INVESTMENT_USD;
  const valid =
    Number.isFinite(value) && value >= MIN_INVESTMENT_USD && value <= MAX_INVESTMENT_USD;
  const inBolivares = rates && valid ? convert(value, "USD", "VES", rates) : null;

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <EmptyState
            icon={Sprout}
            title="No projects are open yet"
            description="Every business is verified before it appears here: two years of
            invoices, stock you can see, and collateral worth more than what it
            asks for. When the first one is ready, it opens with its goal, its
            return, and exactly what your money is for — and you decide."
            action={{ label: `Invest from $${MIN_INVESTMENT_USD}`, disabled: true }}
            note="Nothing has been funded through this screen yet. The showcase opens
            with the first audited project; until then this section states what
            it will do rather than what it has done."
          />
        </div>
      </div>
    );
  }

  const funded = selected ? statusOf(selected) === "FUNDED" : false;

  return (
    <div className="space-y-5">
      <Header />

      {/* What *I* hold, above the catalogue of what I could hold. */}
      <PortfolioCard />

      <ProjectGrid projects={projects} onSelected={(project) => setSelected(project)} />

      {/* The honesty line, under the thing it describes rather than in a
          footnote nobody reaches: four demo records, no audit has happened. */}
      <p className="text-xs leading-relaxed text-slate-400">
        {projects.length} projects · every row marked <span className="font-semibold">demo</span> is a
        sample record: no audit has been performed on it, and nothing here has been funded yet.
        Returns are what the project offers, not what anybody has been paid.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
        <section
          aria-label="Projects on the map"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Where the money goes</h2>
            <span className="text-[11px] text-slate-400">
              {projects.length} projects · Venezuela
            </span>
          </div>
          <VenezuelaMap
            projects={projects}
            selectedId={selected ? selected.id : null}
            onSelect={setSelected}
          />
        </section>

        {!selected ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-center text-sm text-slate-500">
            Select a pin on the map — or a row above — to see the business, and what your dollars
            cost in bolívares today at the official BCV rate.
          </div>
        ) : (
        <section
          aria-label={`Invest in ${selected.name}`}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">
                {funded ? "Goal reached" : "Invest"} in {selected.name}
              </h2>
              <p className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-slate-500">
                {selected.what} · {selected.city}. Backed by{" "}
                <span className="font-medium text-slate-700">{selected.collateral.toLowerCase()}</span>
                , offering <span className="font-medium text-emerald-600">{selected.returnPct}% a year</span>{" "}
                in dollars.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Grade {selected.risk}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="cf-amount"
                className="mb-1 block text-[11px] font-medium text-slate-600"
              >
                Amount (USD)
              </label>
              <div className="flex gap-2">
                <input
                  id="cf-amount"
                  type="number"
                  min={MIN_INVESTMENT_USD}
                  max={MAX_INVESTMENT_USD}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-describedby="cf-amount-bounds"
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="mt-2 flex gap-2">
                {PILL_AMOUNTS.map((pill) => (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => setAmount(String(pill))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      Number(amount) === pill
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    +${pill}
                  </button>
                ))}
              </div>
              <p id="cf-amount-bounds" className="mt-1.5 text-[10px] text-slate-400">
                Between ${MIN_INVESTMENT_USD} and ${MAX_INVESTMENT_USD.toLocaleString("en-US")} ·
                nothing is charged from this screen.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-500">That is today</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                  {inBolivares !== null ? `${formatSmart(inBolivares, "VES")} VES` : "—"}
                </span>
              </div>
              <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-[11px] text-slate-400">
                {belowMinimum
                  ? `The minimum is $${MIN_INVESTMENT_USD}.`
                  : aboveMaximum
                    ? `The maximum in one go is $${MAX_INVESTMENT_USD.toLocaleString("en-US")}.`
                    : !rates
                      ? ratesError
                        ? `No live rate (${ratesError}) — a conversion cannot be shown.`
                        : "Waiting for the official BCV rate…"
                      : `at ${formatSmart(rates.vesPerUsd, "VES")} VES/USD · BCV ${formatAsOf(rates.vesPerUsdAsOf)}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Payment instructions are the next step"
            className="w-full cursor-not-allowed rounded-xl bg-slate-200 px-4 py-3 text-xs font-bold text-slate-400"
          >
            Continue to Pago Móvil
          </button>
          <p className="-mt-2 text-center text-[11px] text-slate-400">
            {funded
              ? "This goal is already reached, so it is not taking new money."
              : "The Pago Móvil instructions for this project come next — the destination and the exact amount for your conversion."}
          </p>
        </section>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="space-y-1.5">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        PayPal AI Crowdfunding
      </h1>
      <p className="max-w-[70ch] text-sm leading-relaxed text-slate-500">
        Finance a real business in Venezuela from ${MIN_INVESTMENT_USD} and receive your share in USD
        — outside the bank, which lends less to a whole country than its digital economy moves in a
        week. You choose where your money goes; the platform audits the business and holds it to the
        terms before a cent is released.
      </p>
    </header>
  );
}
