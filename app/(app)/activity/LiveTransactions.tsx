// app/(app)/activity/LiveTransactions.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, MousePointerClick, TriangleAlert } from "lucide-react";
import type { TransactionsResult } from "@/lib/paypal";
import { summariseTransactions } from "@/lib/transactionTotals";
import JsonGrid from "./JsonGrid";
import TransactionDetail from "./TransactionDetail";

/** What a record is called in the panel: its id when it has one, else where it sits. */
function titleFor(record: Record<string, unknown>, index: number): string {
  const info = record.transactionInfo as Record<string, unknown> | undefined;
  const id = info?.transactionId;
  return typeof id === "string" && id.trim() ? `Transaction ${id}` : `Record ${index + 1}`;
}

/**
 * The order a person reads money in: when it happened, how much, what it was
 * for — then how they stood afterwards — and only at the end the identifiers
 * needed to look a row up again.
 *
 * PayPal's own key order starts with `transactionId`, which is the right order
 * for a machine and the wrong one for someone scanning a table: nobody reads
 * an order reference before they read the amount.
 *
 * `payerInfo` is deliberately **not** first. It is the counterparty — who paid,
 * or who was paid — not this account's own details. Those live inside
 * `transactionInfo` (`paypalAccountId`, `endingBalance`) and they are the same
 * in every row, so leading with them would spend the best position in the
 * table on a constant.
 */
const TRANSACTION_LEAD = [
  "transactionInfo.transactionInitiationDate",
  "transactionInfo.transactionAmount",
  // The amount before its currency, so the number lands first under the group
  // that already names the field. Without this the currency leads, because
  // `currencyCode` is written before `value` in the response.
  "transactionInfo.transactionAmount.value",
  "transactionInfo.transactionSubject",
  "transactionInfo.transactionStatus",
  "transactionInfo.transactionEventCode",
  "transactionInfo.endingBalance",
  "transactionInfo.transactionId",
  "payerInfo.emailAddress",
  "payerInfo.payerName",
] as const;

/**
 * What never scrolls away: when it happened, how much, and in what currency.
 *
 * These are the first three columns the order above puts on screen, so pinning
 * them moves nothing — it only stops the other thirty-eight from taking them
 * off the left edge as the reader looks for the identifier they need. An
 * amount without its currency is not a smaller fact, it is a different one,
 * which is why the pair is pinned together rather than the number alone.
 */
const TRANSACTION_PINNED = [
  "transactionInfo.transactionInitiationDate",
  "transactionInfo.transactionAmount.value",
  "transactionInfo.transactionAmount.currencyCode",
] as const;

/**
 * Fetch the account's own record, and normalise whatever comes back.
 *
 * The shape is checked rather than trusted because a server that answers with
 * something other than this contract — an error page, a proxy's HTML, a route
 * that moved — must not reach a grid that would happily call `undefined.length`
 * and take the section down with it.
 */
async function fetchTransactions(): Promise<TransactionsResult> {
  const fallback = {
    rows: [],
    source: "unavailable" as const,
    window: { startDate: "", endDate: "" },
  };

  let res: Response;
  try {
    res = await fetch("/api/paypal/transactions");
  } catch (error) {
    return { ...fallback, reason: error instanceof Error ? error.message : String(error) };
  }

  const body = (await res.json().catch(() => null)) as Partial<TransactionsResult> | null;
  // Resolved once, not tested through a flag: a boolean named `live` does not
  // narrow anything, and `rows` has to be known non-null before it is returned
  // as though it were.
  const rows = body?.source === "live" && Array.isArray(body.rows) ? body.rows : null;

  return {
    rows: rows ?? [],
    source: rows ? "live" : "unavailable",
    reason: rows
      ? null
      : typeof body?.reason === "string"
        ? body.reason
        : res.ok
          ? "The server returned something this page did not recognise."
          : `The request failed (HTTP ${res.status}).`,
    window: {
      startDate: typeof body?.window?.startDate === "string" ? body.window.startDate : "",
      endDate: typeof body?.window?.endDate === "string" ? body.window.endDate : "",
    },
  };
}

/** `2026-09-06 → 2026-10-06`: the window as dates, not as ISO timestamps. */
function formatWindow(window: { startDate: string; endDate: string }): string {
  if (!window.startDate || !window.endDate) return "the last 30 days";
  return `${window.startDate.slice(0, 10)} → ${window.endDate.slice(0, 10)}`;
}

/**
 * What PayPal itself recorded — the third ledger.
 *
 * The other two on this page are this app's memory: what the policy allowed,
 * and what it stopped. This one is the account's own answer, read live, and it
 * is the only one of the three a browser cannot edit. Keeping them apart in
 * the copy matters more than keeping them apart in the code — a reader who
 * thinks the local rows *are* PayPal's has understood the page backwards.
 *
 * Three states are told apart on purpose. "Could not ask", "asked and it is
 * empty", and "here it is" are different facts, and only the third gets a
 * grid: an empty table that meant "we never reached PayPal" would read as an
 * account with no history, which is exactly the sort of quiet lie this project
 * has spent its commits removing.
 */
export default function LiveTransactions() {
  const [result, setResult] = useState<TransactionsResult | null>(null);
  // Which record is being read vertically. Identity is compared rather than an
  // index, so clicking the open row again can close it without keeping a
  // position that a re-fetch would have invalidated.
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  // Where the detail lands, so opening it brings it to the reader. The panel
  // sits below the whole grid — a grid of twenty rows is taller than a screen
  // — and a detail opened a screen below the row that was clicked is a detail
  // that did not open as far as the reader is concerned. `nearest` moves only
  // as far as it must, and not at all when the panel is already in view.
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    void fetchTransactions().then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = result?.rows ? summariseTransactions(result.rows) : null;
  // One line per direction per currency. Flat-mapped rather than filtered so
  // an empty direction cannot leave a stray separator behind.
  const totalsLine = summary
    ? summary.currencies
        .flatMap((entry) => {
          const parts: string[] = [];
          if (entry.inAmount > 0) parts.push(`${entry.inAmount.toFixed(2)} ${entry.currency} in`);
          if (entry.outAmount > 0) parts.push(`${entry.outAmount.toFixed(2)} ${entry.currency} out`);
          if (entry.fees > 0) parts.push(`${entry.fees.toFixed(2)} ${entry.currency} in fees`);
          return parts;
        })
        .join("   ·   ")
    : "";

  return (
    // Excluded from the printed report: the report is a table this page styled
    // for paper, and a grid with thirty columns is not it. Say so rather than
    // let the reader wonder why the PDF has two of the three sections.
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ArrowLeftRight className="h-4 w-4 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
          Money that moved
        </h2>
        <p className="mt-0.5 max-w-[74ch] text-xs leading-relaxed text-slate-500">
          The account&apos;s own record, read live from Transaction Search. The two sections
          below are this app&apos;s memory of what it allowed and what it stopped; this one is
          PayPal&apos;s, and it is the only one of the three this browser cannot edit.
        </p>
      </div>

      <div className="px-5 py-4">
        {!result ? (
          <p className="text-xs text-slate-400">Asking PayPal…</p>
        ) : result.source === "unavailable" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
              <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              The account&apos;s history could not be read.
            </p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-amber-700">{result.reason}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-600">
              This says nothing about your transactions — it says this page could not ask.
              The two local sections below are unaffected.
            </p>
          </div>
        ) : result.rows.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-500">
            PayPal answered, and there is nothing between {formatWindow(result.window)}. This is
            the empty answer, not the failed one: the account was read, and it is quiet.
          </p>
        ) : (
          <>
            <JsonGrid
              rows={result.rows}
              label="Transactions PayPal recorded, last 30 days"
              lead={TRANSACTION_LEAD}
              pinned={TRANSACTION_PINNED}
              selected={selected}
              onRowClicked={(record) => {
                // Clicking the open row again closes it: a second control just
                // to dismiss would be one more thing to hunt for.
                const row = record as Record<string, unknown>;
                setSelected((current) => (current === row ? null : row));
              }}
            />

            {selected ? (
              <div ref={detailRef}>
                <TransactionDetail
                  record={selected}
                  title={titleFor(selected, result.rows.indexOf(selected))}
                  onClose={() => setSelected(null)}
                />
              </div>
            ) : (
              // Discoverability, not decoration: nothing about a grid says it
              // can be clicked, and a vertical reading that only exists after
              // an unmarked gesture does not exist for most people. Kept as a
              // bordered callout rather than a faint line — the affordance has
              // to be noticed before it can be used.
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5">
                <MousePointerClick
                  className="mt-0.5 h-4 w-4 shrink-0 text-blue-500"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <p className="text-xs leading-relaxed text-blue-800">
                  <strong className="font-semibold">Click any row</strong> to open that transaction
                  on its own, read top to bottom. The grid answers <em>what is here</em>; the detail
                  answers <em>what is in this one</em>.
                </p>
              </div>
            )}

            {/* Totals are an opinion about the rows rather than a row, so they
                are stated as one: two directions per currency, never a single
                figure. A credit and a debit added together is arithmetic
                nobody can use — the purchases table further down this page
                already refuses it by splitting per currency, and this refuses
                it by splitting per direction. */}
            {totalsLine ? (
              <>
                <p className="mt-3 text-xs font-semibold text-slate-700">{totalsLine}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Summed from what PayPal reported, split by direction — money in and money out
                  are never added into one figure. Fees come from their own field and are shown
                  apart, because an amount and the fee taken from it are not the same number.
                  {summary && summary.uncounted > 0 ? (
                    <>
                      {" "}
                      {summary.uncounted} record{summary.uncounted === 1 ? "" : "s"} carried no
                      readable amount and is not counted.
                    </>
                  ) : null}
                </p>
              </>
            ) : null}

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              {result.rows.length} record{result.rows.length === 1 ? "" : "s"} · window asked:{" "}
              {formatWindow(result.window)} — 30 days, the most Transaction Search accepts is 31.
              New activity can take up to three hours to appear, so the newest row may be older
              than it looks. Status is PayPal&rsquo;s own: <strong>S</strong> success ·{" "}
              <strong>P</strong> pending · <strong>D</strong> denied · <strong>V</strong> reversed ·{" "}
              <strong>F</strong> partially refunded. Values are printed exactly as PayPal returned
              them — nothing here is renamed or rounded.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
