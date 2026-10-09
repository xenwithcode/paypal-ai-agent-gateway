// app/(app)/activity/ActivityByType.tsx
"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, ReceiptText, Sprout } from "lucide-react";
import {
  activityByType,
  hasActivity,
  type ActivityByCurrency,
} from "@/lib/activityByType";
import { readPolicyRows } from "@/lib/history";
import { ensureHydrated } from "@/lib/store";

/**
 * Where the money that moved went — the question above the three books.
 *
 * `Purchases completed`, the live ledger and `Charges refused` each tell one
 * story; this sums them by kind, so the page answers "adónde se fue el dinero"
 * before it asks the reader to read anything.
 *
 * One colour, deliberately. The palette on this app already means things —
 * green is money that settled, grey came back, amber is running out of room —
 * and inventing three decorative colours for three kinds would teach a second
 * vocabulary that the rest of the product does not speak. The kind is the row
 * label; the bar only carries its size.
 */
const KINDS = [
  {
    key: "investment",
    label: "Investments",
    hint: "stakes in campaigns",
    Icon: Sprout,
  },
  {
    key: "transfer",
    label: "Transfers",
    hint: "money sent to a person",
    Icon: ArrowRightLeft,
  },
  {
    key: "purchase",
    label: "Purchases",
    hint: "orders from the catalogue",
    Icon: ReceiptText,
  },
] as const;

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export default function ActivityByType() {
  const [totals, setTotals] = useState<ActivityByCurrency[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // After hydration, like every other reader of this store: on a browser
    // that has never seen the app, the ledger is on the server until this
    // resolves — and deciding the chart is empty before then would be a lie
    // that resolves itself in a second.
    void ensureHydrated().then(() => {
      if (!cancelled) setTotals(activityByType(readPolicyRows()));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Not rendered while the store is still being asked — and not rendered at
  // all when nothing has settled, because three empty bars are not a chart.
  if (!totals || !hasActivity(totals)) return null;

  return (
    <section
      aria-label="Where the money went"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden"
    >
      <h2 className="text-sm font-semibold text-slate-900">Where the money went</h2>
      <p className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-slate-500">
        Every order that <span className="font-medium text-slate-700">settled</span> — authorized,
        and the money actually moved. Reserved money is held on Overview, and a released order gave
        it back, so neither is counted here twice.
      </p>

      <div className="mt-4 space-y-5">
        {totals.map((group) => {
          // Scaled within its own currency: comparing a USD bar with a PYUSD
          // one would be the sum this screen refuses to make.
          const peak = Math.max(group.investment, group.transfer, group.purchase, 1);

          return (
            <div key={group.currency}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {group.currency}
                <span className="ml-2 font-mono font-semibold text-slate-600">
                  {money(group.total)}
                </span>
                <span className="ml-1 font-normal normal-case tracking-normal">settled</span>
              </p>

              <ul className="mt-2 space-y-2">
                {KINDS.map(({ key, label, hint, Icon }) => {
                  const value = group[key];
                  const pct = Math.round((value / peak) * 100);
                  return (
                    <li key={key} className="flex items-center gap-3">
                      <span className="flex w-40 shrink-0 items-center gap-2 text-xs text-slate-600">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                        {/* Width as a style, not a class: the bar is a number,
                            and a number cannot be one of a dozen fixed steps. */}
                        <span
                          className="block h-full rounded-full bg-blue-900 transition-all"
                          style={{ width: `${value > 0 ? Math.max(pct, 2) : 0}%` }}
                        />
                      </span>
                      <span className="w-28 shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                        {money(value)}
                        <span className="block text-[10px] font-normal text-slate-400">{hint}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
