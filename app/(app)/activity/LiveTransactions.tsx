// app/(app)/activity/LiveTransactions.tsx
"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, TriangleAlert } from "lucide-react";
import type { TransactionsResult } from "@/lib/paypal";
import JsonGrid from "./JsonGrid";

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

  useEffect(() => {
    let cancelled = false;
    void fetchTransactions().then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
            <JsonGrid rows={result.rows} label="Transactions PayPal recorded, last 30 days" />
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
