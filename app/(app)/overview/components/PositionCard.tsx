// app/(app)/overview/components/PositionCard.tsx
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { accountPosition, hasPositionFigure, type InvestedPosition } from "@/lib/position";
import { STATUS } from "@/lib/policy";
import type { PolicyRow } from "../types";

/**
 * Where your money is — the one screen that answers the question everybody
 * opens a financial dashboard to ask: **how much can I spend right now**.
 *
 * Three cards used to answer it between them (the balance in the header,
 * *Money in flight*, *What you have*), and none of them said the figure. The
 * union is not a fourth card that adds them up: a reserved pledge is already
 * inside the balance, an awaiting row has touched nothing, and a released one
 * gave the money back. So the card shows **two ledgers, side by side, with a
 * line between them saying why they are not added** — the same rule this
 * project has followed since the day the *compras + balances* pie was
 * rejected.
 *
 * Drawn in markup rather than with AG Charts, on purpose: the figure this
 * card leads with is a number, not a shape, and every segment here can carry
 * a tooltip that names the rows it is made of — which is the rule *Money in
 * flight* learned (1b.1): a total that does not name its rows is a total a
 * reader has to take on faith.
 */

/** The vocabulary the whole app already speaks, said once. */
const STATES = {
  free: { label: "Free to spend", fill: "#98a2b3" },
  committed: { label: "Committed to orders", fill: "#0042a1" },
  paid: { label: "Paid", fill: "#099250" },
  reserved: { label: "Reserved", fill: "#0042a1" },
  returned: { label: "Returned", fill: "#98a2b3" },
} as const;

function money(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

type Segment = { key: string; label: string; fill: string; value: number; note?: string };

/**
 * One bar, drawn from segments that name themselves.
 *
 * Marked hidden for the same reason every other drawing on this app is: the
 * legend underneath prints everything the bar says, in words, with the same
 * figures — so the picture is the picture of a sentence, never the only place
 * the number exists.
 */
function Bar({ segments, total }: { segments: Segment[]; total: number }) {
  const width = (value: number) => (total > 0 ? Math.max(0, (value / total) * 100) : 0);

  return (
    <div
      aria-hidden="true"
      className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
    >
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <div
            key={segment.key}
            title={segment.note ?? `${segment.label} — ${money(segment.value)}`}
            style={{ width: `${width(segment.value)}%`, backgroundColor: segment.fill }}
            className="h-full"
          />
        ))}
    </div>
  );
}

/** The rows a segment is made of — named, never omitted, in arrival order. */
function membersOf(rows: readonly PolicyRow[], pick: (row: PolicyRow) => boolean): string {
  const members = rows
    .filter(pick)
    .map((row) => `${row.what || "(unnamed)"} ${money(row.limit)}`);
  if (members.length === 0) return "";
  // Six names and a sum, past that: a tooltip longer than the card it hovers
  // over is a tooltip nobody reads, and the sum keeps it honest anyway.
  const shown = members.slice(0, 6);
  const rest = members.length - shown.length;
  return (
    shown.join(" · ") +
    (rest > 0 ? ` · and ${rest} more (${money(rows.filter(pick).reduce((sum, row) => sum + row.limit, 0))})` : "")
  );
}

/** The second ledger, as its own block under the line that separates it. */
function InvestedBlock({
  invested,
  rows,
  positionCount,
}: {
  invested: InvestedPosition;
  rows: readonly PolicyRow[];
  positionCount: number;
}) {
  const segments: Segment[] = [
    {
      key: "paid",
      label: STATES.paid.label,
      fill: STATES.paid.fill,
      value: invested.paid,
      note: membersOf(rows, (row) => Boolean(row.project) && row.status === STATUS.captured),
    },
    {
      key: "reserved",
      label: STATES.reserved.label,
      fill: STATES.reserved.fill,
      value: invested.reserved,
      note: membersOf(rows, (row) => Boolean(row.project) && row.status === STATUS.reserved),
    },
    {
      key: "returned",
      label: STATES.returned.label,
      fill: STATES.returned.fill,
      value: invested.returned,
      note: membersOf(rows, (row) => Boolean(row.project) && row.status === STATUS.released),
    },
  ];

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Invested · PayPal AI Crowdfunding
        </p>
        <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
          {money(invested.committed)}
          <span className="ml-1.5 text-[11px] font-medium text-slate-400">on the table</span>
        </p>
      </div>

      <div className="mt-2">
        <Bar segments={segments} total={invested.placed} />
      </div>

      <dl className="mt-2 space-y-1">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-baseline justify-between gap-2">
            <dt className="flex min-w-0 items-center gap-2 text-[11px] text-slate-600">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: segment.fill }}
              />
              <span className="truncate">
                {segment.label}
                <span className="text-slate-400"> · {money(segment.value)}</span>
              </span>
            </dt>
          </div>
        ))}
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-relaxed">
        {invested.perMonth > 0 && (
          <span className="font-semibold text-emerald-700">
            Earning {money(invested.perMonth)} per month
            <span className="font-normal text-slate-500">
              {" "}
              · {money(invested.accrued, 4)} accrued · {invested.returnPct.toFixed(1)}% a year,
              weighted
            </span>
          </span>
        )}
        {/* The figure the portfolio card leads with, and the one this block
            used to leave out: what was ever put in. A reader whose money came
            back sees "on the table $0.00" and, without this line, reads it as
            "I never invested" — which is true of the states and false of the
            history. */}
        {invested.placed > 0 && (
          <span className="text-slate-500">
            Put in so far{" "}
            <span className="font-semibold text-slate-700">{money(invested.placed)}</span> across{" "}
            {invested.count} campaign{invested.count === 1 ? "" : "s"}
          </span>
        )}
        <Link
          href="/crowdfunding"
          className="font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          Open the showcase ({positionCount} position{positionCount === 1 ? "" : "s"}) →
        </Link>
      </div>

      {/* A screen that reports money it never received is the one lie a
          financial page cannot make up for. */}
      {invested.allSample && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          <span className="rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            sample
          </span>{" "}
          <span className="ml-1 font-semibold text-slate-500">Nobody funded these.</span> They are
          here so the figures can be seen with money in them; your first real pledge replaces all
          of them.
        </p>
      )}
    </div>
  );
}

export default function PositionCard({
  entries,
  rows,
  campaigns,
}: {
  /** Every currency PayPal reported — read on the server, passed down. */
  entries: readonly { currency: string; value: number }[];
  /** The table as it stands, so both ledgers are the same rows. */
  rows: readonly PolicyRow[];
  /** `id → offered rate`, read from the shipped seed on the server. */
  campaigns: readonly { id: string; returnPct: number }[];
}) {
  const position = useMemo(
    () => accountPosition(entries, rows, campaigns),
    [entries, rows, campaigns]
  );

  // Nothing to show is nothing: a card of zeroes explains nothing, and the
  // page already has a table that says what is missing.
  if (!hasPositionFigure(position)) return null;

  const spendable = position.spendable[0] ?? null;
  const others = position.spendable.slice(1);
  const paypalTotal = position.balances.reduce((sum, split) => sum + split.total, 0);
  const committed = position.balances.reduce((sum, split) => sum + split.committed, 0);
  const free = position.balances.reduce((sum, split) => sum + split.free, 0);

  const paypalSegments: Segment[] = [
    {
      key: "free",
      label: STATES.free.label,
      fill: STATES.free.fill,
      value: free,
    },
    {
      key: "committed",
      label: STATES.committed.label,
      fill: STATES.committed.fill,
      value: committed,
      // The rule 1b.1 left: a total that does not name its rows is a total
      // the reader has to trust, and trust is not a feature.
      note: membersOf(rows, (row) => row.status === STATUS.reserved) || undefined,
    },
  ];

  return (
    <section
      aria-label="Where your money is"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The question, not the noun: a reader who does not already know
              the vocabulary gets the answer instead of the name of the card. */}
          <h2 className="text-base font-semibold text-slate-900">
            How much can you actually spend?
          </h2>
          <p className="mt-0.5 max-w-[74ch] text-xs leading-relaxed text-slate-500">
            Two ledgers and one promise: what PayPal holds, split into what is free and what your
            orders have set aside; what sits in campaigns, below the line; and what will be
            charged on its own.{" "}
            <span className="font-medium text-slate-600">
              The two ledgers are never added together
            </span>
            , because a pledge is still inside the balance it came from — and the promise holds
            nothing at all.
          </p>
        </div>
        {position.invested?.allSample && (
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Sample positions
          </span>
        )}
      </div>

      {/* The figure the whole card exists to lead with. One currency: the
          largest free balance, because that is the money this account can
          actually reach first. The rest are listed, never summed into it. */}
      {spendable && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-mono text-3xl font-bold tabular-nums text-slate-900">
            {money(spendable.value)}
          </p>
          <p className="text-xs text-slate-500">
            free to spend in {spendable.currency}
            {/* Only worth saying when something is set aside: with nothing
                committed the second figure repeats the first, and a repeated
                number reads as two numbers. */}
            {committed > 0 && (
              <span> · of {money(paypalTotal)} PayPal holds</span>
            )}
          </p>
          {others.map((entry) => (
            <span
              key={entry.currency}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-slate-600"
              title={`Free to spend in ${entry.currency} — currencies are never added together`}
            >
              {money(entry.value)} {entry.currency}
            </span>
          ))}
        </div>
      )}

      {/* Ledger one. */}
      {paypalTotal > 0 && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              In PayPal
            </p>
            <p className="font-mono text-sm font-bold tabular-nums text-slate-900">
              {money(paypalTotal)}
              {committed > 0 && (
                <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                  · {money(committed)} set aside
                </span>
              )}
            </p>
          </div>
          <div className="mt-2">
            <Bar segments={paypalSegments} total={paypalTotal} />
          </div>
          <dl className="mt-2 space-y-1">
            {paypalSegments.map((segment) => (
              <div key={segment.key} className="flex items-baseline justify-between gap-2">
                <dt className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.fill }}
                  />
                  <span className="truncate">
                    {segment.label}
                    <span className="text-slate-400"> · {money(segment.value)}</span>
                  </span>
                </dt>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* The line between the ledgers, saying why it is there. */}
      <p className="my-3 text-center text-[11px] leading-relaxed text-slate-400">
        ↓ A hold moves nothing: money pledged below is still inside the balance above ↓
      </p>

      {/* Ledger two — and the promise attached to it. */}
      {position.invested && (
        <InvestedBlock
          invested={position.invested}
          rows={rows}
          positionCount={position.invested.count}
        />
      )}

      {/* What has not left yet: counted, because it is the next thing that
          will — and never counted as money, because it has touched nothing. */}
      {position.awaiting.count > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-700">
            {position.awaiting.count} order{position.awaiting.count === 1 ? "" : "s"} awaiting your
            approval
          </span>{" "}
          ({money(position.awaiting.amount)}). Nothing is held until you approve — and what you
          approve is settled only when its condition holds.
        </p>
      )}

      {/* The third ledger: what runs on its own. Neither set aside nor gone —
          which is why it has its own block and its own sentence rather than a
          fourth colour on the bars above. */}
      {position.standing.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Standing commitments
            </p>
            <p className="text-xs font-semibold text-slate-500">
              {position.standing.length} active · nothing held
            </p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {position.standing.map((entry) => (
              <li
                key={`${entry.currency}-${entry.what}`}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate text-slate-600">
                  {entry.what}
                  {entry.when && <span className="text-slate-400"> · {entry.when}</span>}
                </span>
                {/* The figure is the point of the row, so it is set like the
                    other figures on this card rather than like its caption. */}
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900">
                  {money(entry.amount)} {entry.currency}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Nothing is held against these: they are what will be charged, and when. Currencies are
            listed apart, and none of it is added to either ledger above.
          </p>
        </div>
      )}
    </section>
  );
}
