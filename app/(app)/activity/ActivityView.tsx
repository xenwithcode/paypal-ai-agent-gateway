// app/(app)/activity/ActivityView.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Printer, ReceiptText, ShieldBan, ImageOff } from "lucide-react";
import {
  readPurchases,
  readBlockedAttempts,
  formatDate,
  formatMoney,
  totalsByCurrency,
  type Purchase,
  type BlockedAttempt,
} from "@/lib/history";
import { ensureHydrated } from "@/lib/store";

type Data = { purchases: Purchase[]; blocked: BlockedAttempt[] };

function SampleChip() {
  return (
    <span className="ml-2 inline-block shrink-0 rounded-full border border-slate-300 bg-slate-50 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-slate-500 print:border-slate-400 print:bg-white">
      Sample
    </span>
  );
}

function Thumbnail({ purchase }: { purchase: Purchase }) {
  const [failed, setFailed] = useState(false);
  if (!purchase.thumbnail || failed) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300 print:border-slate-300 print:bg-white">
        <ImageOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
  }
  return (
    <Image
      src={purchase.thumbnail}
      alt={purchase.what}
      width={72}
      height={72}
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
    />
  );
}

/**
 * What the agent did: purchases that settled, and charges it refused.
 *
 * Everything is read after mount, so the server render and the first client
 * render agree — this page cannot know about storage while it is being
 * rendered on the server.
 *
 * Printing is deliberately plain HTML: the report is a table with borders and
 * type, no background fills that a browser's print engine would drop, so
 * "Save as PDF" produces the same document a printer would.
 */
export default function ActivityView() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Ask the store before deciding the report is empty: on a browser that has
    // never seen this app, the ledger lives on the server until this resolves.
    void ensureHydrated().then(() => {
      if (cancelled) return;
      setData({ purchases: readPurchases(), blocked: readBlockedAttempts() });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const generated = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    // Fixed height so the content arriving after mount cannot push the page.
    <div className="min-h-[340px]">
      {/* Report head — only exists on paper. */}
      <div className="hidden print:mb-6 print:block">
        <h1 className="text-2xl font-bold text-slate-900">Purchase report</h1>
        <p className="mt-1 text-sm text-slate-600">
          PayPal AI Agent Gateway · generated {generated}
        </p>
      </div>

      {!data ? null : (
        <div className="space-y-6">
          {/* ── Purchases ─────────────────────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 print:border-b-2 print:border-slate-900 print:px-0">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ReceiptText className="h-4 w-4 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                  Purchases completed
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Orders that were authorized, met their condition and settled.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 print:hidden"
              >
                <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Print / save as PDF
              </button>
            </div>

            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Purchases made by the PayPal AI Agent, with date, item, condition, endpoint and
                amount.
              </caption>
              <thead>
                <tr className="border-b border-slate-100 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 print:border-slate-300">
                  <th scope="col" className="px-5 py-2.5">Date</th>
                  <th scope="col" className="px-5 py-2.5">Item</th>
                  <th scope="col" className="px-5 py-2.5">Condition</th>
                  <th scope="col" className="px-5 py-2.5">Endpoint</th>
                  <th scope="col" className="px-5 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.purchases.map((purchase) => (
                  <tr
                    key={`${purchase.id}-${purchase.what}`}
                    className="border-b border-slate-100 align-top print:border-slate-200"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-xs tabular-nums text-slate-500">
                      {formatDate(purchase.when)}
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <Thumbnail purchase={purchase} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800">
                            {purchase.what}
                            {purchase.sample && <SampleChip />}
                          </span>
                          <span className="block text-xs text-slate-400">
                            {purchase.merchant || "no merchant named"}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-600">
                      {purchase.condition || <span className="italic text-slate-400">— spend now</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {purchase.endpoint || <span className="italic text-slate-400">no endpoint set</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {formatMoney(purchase.amount, purchase.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 print:border-slate-900">
                  <td colSpan={4} className="px-5 py-3 text-xs text-slate-500">
                    {data.purchases.length} purchase{data.purchases.length === 1 ? "" : "s"} recorded
                  </td>
                  <td className="px-5 py-3 text-right">
                    {/* Split by currency: a PYUSD total next to a USD one
                        would be arithmetic nobody could use. */}
                    {totalsByCurrency(data.purchases).map((total) => (
                      <span key={total.currency} className="block font-mono text-sm font-bold tabular-nums text-slate-900">
                        {formatMoney(total.total, total.currency)}
                      </span>
                    ))}
                  </td>
                </tr>
              </tfoot>
            </table>

            <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-relaxed text-slate-400 print:border-slate-200 print:px-0">
              Rows marked <strong className="font-semibold text-slate-500">Sample</strong> are
              seeded history: the prices and images come from the demo catalog, but the purchases
              did not happen. Unmarked rows are orders this app captured. No PayPal credentials are
              configured, so no money has moved.
            </p>
          </section>

          {/* ── Refusals ──────────────────────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldBan className="h-4 w-4 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                Charges refused
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                A payment that was stopped never reaches PayPal, so this is the only record of it.
              </p>
            </div>

            <ul className="divide-y divide-slate-100">
              {data.blocked.map((attempt) => (
                <li key={attempt.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm font-medium text-slate-800">
                      {attempt.what}
                      {attempt.sample && <SampleChip />}
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-red-700">
                      {formatMoney(attempt.amount, attempt.currency)}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs leading-relaxed text-red-600">{attempt.reason}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                    <span>{formatDate(attempt.when)}</span>
                    <span>{attempt.endpoint}</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
