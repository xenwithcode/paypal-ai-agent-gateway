// app/(app)/crowdfunding/PortfolioCard.tsx
"use client";

import type { ManifestRow } from "@/lib/history";
import {
  dividendOn,
  earnsDividend,
  type Dividend,
  type Project,
} from "@/lib/crowdfunding";
import { STATUS } from "@/lib/policy";

/**
 * What *you* hold — the sub-section under the title, so the answer to "what do
 * I have?" is above the fold rather than below the catalogue of things you
 * could have.
 *
 * The numbers are read from the same rows Overview writes, because an
 * investment here **is** a purchase order with a `project` field: there is no
 * second ledger to keep in step, and the position shown is the record the
 * console already logged.
 *
 * Three figures, never one: what has actually moved, what is only reserved,
 * and what it earns per day. A pledge that is reserved has not been paid, and
 * calling it "invested" would report money the business has not received —
 * the one lie a financial screen may not tell. The dividend follows the same
 * discipline: accruing is not paid, so the figure carries its day count and
 * the note under the card says what the money is still waiting for, rather
 * than letting an emerald number imply cash in hand.
 *
 * Empty means empty: with no rows the screen says so rather than showing
 * sample positions nobody funded.
 */
export default function PortfolioCard({
  investments,
  projects,
}: {
  /** `null` while the store is still being asked — not the same as empty. */
  investments: ManifestRow[] | null;
  projects: Project[];
}) {
  const rows = investments ?? [];
  const byId = new Map(projects.map((project) => [project.id, project]));
  const funded = (row: ManifestRow) => row.status === STATUS.captured;
  const reservedRow = (row: ManifestRow) => row.status === STATUS.reserved;
  // The third outcome, which this card did not know about: a hold the payer
  // cancelled. It fell into the default branch and was printed as *Reserved*
  // while Overview and Money in Flight both said Released — one record read
  // two ways on two screens, which is the bug this line fixes.
  const returnedRow = (row: ManifestRow) => row.status === STATUS.released;

  // The question this card has to answer first: *how much have I put in?*
  // Every other figure is a state that money can be in, and a reader who asks
  // the main question used to find $0 — because the position in front of them
  // had been released, which is true of the states and false of the total.
  // Historical, so it counts what came back too; the three states below say
  // where it is now.
  const investedSoFar = rows.reduce((sum, row) => sum + row.limit, 0);
  const paid = rows.filter(funded).reduce((sum, row) => sum + row.limit, 0);
  const reserved = rows.filter(reservedRow).reduce((sum, row) => sum + row.limit, 0);
  const returned = rows.filter(returnedRow).reduce((sum, row) => sum + row.limit, 0);
  // What a position earns, read through the rule the tests pin: the formula,
  // the day count and the eligibility all live in `lib/crowdfunding`, so the
  // figure on screen cannot drift from the one the suite checks — the same
  // reason `campaignAction` left the component it used to live in.
  //
  // `since` is when PayPal set the money aside, not when it settled: a
  // reservation is a commitment the campaign can still fail, and the note
  // under this card says exactly that.
  const dividendOf = (row: ManifestRow): Dividend | null => {
    if (!earnsDividend(row)) return null;
    const project = row.project ? byId.get(row.project) : undefined;
    if (!project) return null;
    return dividendOn({
      amountUsd: row.limit,
      returnPct: project.returnPct,
      since: row.createdAt ?? row.capturedAt ?? null,
    });
  };

  const earning = rows
    .map((row) => dividendOf(row))
    .filter((dividend): dividend is Dividend => dividend !== null);
  // The rate, and what the rate has produced so far: one number says what a
  // day is worth and the other says how many of them have passed. Either alone
  // is a figure a reader has to take on faith.
  const perDay = earning.reduce((sum, dividend) => sum + dividend.perDay, 0);
  const accrued = earning.reduce((sum, dividend) => sum + dividend.total, 0);
  const projectsCount = new Set(rows.map((row) => row.project).filter(Boolean)).size;

  const stats = [
    {
      label: "Invested so far",
      value: investments === null ? "—" : money(investedSoFar),
      note: "total you have put in",
    },
    {
      label: "Paid",
      value: investments === null ? "—" : money(paid),
      note: "moved through PayPal",
    },
    {
      label: "Reserved",
      value: investments === null ? "—" : money(reserved),
      note: "set aside, not taken",
    },
    {
      label: "Earning now",
      value: investments === null ? "—" : money(perDay, 4),
      note:
        investments === null
          ? "per day, in dollars"
          : earning.length
            ? `per day · ${money(accrued, 4)} accrued so far`
            : "per day · nothing reserved or paid yet",
    },
    {
      label: "Returned",
      value: investments === null ? "—" : money(returned),
      note: "released back to you",
    },
    {
      label: "Projects",
      value: investments === null ? "—" : String(projectsCount),
      note: "you are behind",
    },
  ];

  return (
    <section
      aria-label="Your investments"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Your investments</h2>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            rows.length
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-500"
          }`}
        >
          {investments === null ? "Loading" : rows.length ? `${rows.length} position${rows.length === 1 ? "" : "s"}` : "Nothing yet"}
        </span>
      </div>

      {/* Six figures, two rows of three: one column would make each card
          narrow enough that "$1,234" wraps, and six across would do the same
          at half the width. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {rows
            .slice()
            .reverse()
            .map((row) => {
              const project = row.project ? byId.get(row.project) : undefined;
              const isPaid = funded(row);
              const wasReturned = returnedRow(row);
              const dividend = dividendOf(row);
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {project?.name ?? row.what}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {isPaid
                        ? `Paid ${row.capturedAt ? new Date(row.capturedAt).toLocaleDateString("en-US") : ""} · earns ${project?.returnPct ?? 0}% a year`
                        : wasReturned
                          ? "Released — the hold was cancelled and nothing was taken"
                          : project
                            ? `Reserved until ${project.deadline} — captured if the goal is met, released if it is not`
                            : row.status}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* The odometer: what this position has accrued, and how
                        many days it took. It changes when the day changes, so
                        there is no timer here — a number that moves once a day
                        does not need something redrawing it every second. */}
                    <div className="text-right">
                      <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                        {money(row.limit)}
                      </span>
                      {dividend && (
                        <p
                          title={`Accrued dividends over ${dividend.days} day${
                            dividend.days === 1 ? "" : "s"
                          } at ${project?.returnPct ?? 0}% a year`}
                          className="font-mono text-[10px] tabular-nums text-emerald-600"
                        >
                          +{money(dividend.total, 4)} · {dividend.days}d
                        </p>
                      )}
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isPaid
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : wasReturned
                            ? "border-slate-300 bg-slate-100 text-slate-600"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                      }`}
                    >
                      {isPaid ? "Paid" : wasReturned ? "Released" : "Reserved"}
                    </span>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      {rows.length > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Dividends accrue from the day PayPal set the money aside, on positions that are{" "}
          <span className="font-semibold text-slate-500">reserved or paid</span> — promised, not
          paid: a reservation earns only if the campaign reaches its goal, and a released one earns
          nothing.
        </p>
      )}

      {rows.length === 0 && investments !== null && (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-700">Nothing funded yet.</span> Pick a project
          below and approve it in PayPal: what you pay lands here, what you pledge stays reserved
          until its campaign closes, and both are counted apart — because a business that has not
          received the money must not appear to have.
        </p>
      )}
    </section>
  );
}

function money(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
