// app/(app)/crowdfunding/PortfolioCard.tsx
"use client";

import type { ManifestRow } from "@/lib/history";
import type { Project } from "@/lib/crowdfunding";
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
 * the one lie a financial screen may not tell.
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

  const paid = rows.filter(funded).reduce((sum, row) => sum + row.limit, 0);
  const reserved = rows.filter(reservedRow).reduce((sum, row) => sum + row.limit, 0);
  // What the earned part produces per day, from the project's own offer —
  // shown only for money that actually moved, because reserved funds earn
  // nothing yet.
  const perDay = rows
    .filter(funded)
    .reduce((sum, row) => {
      const project = row.project ? byId.get(row.project) : undefined;
      return sum + (project ? (row.limit * project.returnPct) / 100 / 365 : 0);
    }, 0);
  const projectsCount = new Set(rows.map((row) => row.project).filter(Boolean)).size;

  const stats = [
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
      note: "per day, in dollars",
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

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {project?.name ?? row.what}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {isPaid
                        ? `Paid ${row.capturedAt ? new Date(row.capturedAt).toLocaleDateString("en-US") : ""} · earns ${project?.returnPct ?? 0}% a year`
                        : project
                          ? `Reserved until ${project.deadline} — captured if the goal is met, released if it is not`
                          : "Reserved"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {money(row.limit)}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        isPaid
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-blue-200 bg-blue-50 text-blue-700"
                      }`}
                    >
                      {isPaid ? "Paid" : "Reserved"}
                    </span>
                  </div>
                </li>
              );
            })}
        </ul>
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
