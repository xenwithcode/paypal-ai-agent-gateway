// app/(app)/recurring/RecurringView.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CreditCard, Repeat, ImageOff } from "lucide-react";
import { readPolicyRows, type ManifestRow } from "@/lib/history";
import EmptyState from "../components/EmptyState";

/**
 * Standing allowances: approved once, running until they are removed.
 *
 * That is the definition this section was given — "alta única, luego
 * autónomo" — so a row belongs here when it is active and carries no
 * condition to wait for. A conditional order is a purchase, not a
 * subscription: it resolves once and stops.
 *
 * Read after mount for the same reason every other stored view is: the server
 * rendering this page has no browser storage to look in.
 */

function isStandingOrder(row: ManifestRow): boolean {
  return row.status === "Active" && !(row.condition ?? "").trim();
}

/** The product's own picture, or a labelled placeholder — never a broken glyph. */
function RecurringThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
        <ImageOff className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={88}
      height={88}
      onError={() => setFailed(true)}
      className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-white object-cover"
    />
  );
}

export default function RecurringView() {
  const [rows, setRows] = useState<ManifestRow[] | null>(null);

  useEffect(() => {
    setRows(readPolicyRows().filter(isStandingOrder));
  }, []);

  return (
    // Fixed height so the list arriving after mount cannot push the page.
    <div className="min-h-[340px]">
      {rows === null ? null : rows.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No recurring payments yet"
          description="Approve a standing allowance from the Overview — one with no condition to wait for — and it appears here. You add it once; it runs until you take it off."
          action={{ label: "Approve an allowance", href: "/overview" }}
          note="Adding and removing services directly from this page arrives in a later iteration."
        />
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Repeat className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {rows.length} active commitment{rows.length === 1 ? "" : "s"} — each one keeps running
            until you remove it.
          </p>

          {rows.map((row) => (
            <article
              key={row.id ?? row.what}
              className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-slate-300"
            >
              <RecurringThumb src={row.marketImage ?? null} alt={row.what} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{row.what}</p>
                <p className="truncate text-xs text-slate-400">
                  {row.merchant || "no merchant named"}
                  {row.allowEndpoint ? ` · ${row.allowEndpoint}` : ""}
                </p>
              </div>

              <div className="text-right">
                <p className="font-mono text-sm font-semibold tabular-nums text-emerald-700">
                  {row.limit.toFixed(2)} {row.currency}
                </p>
                {/* No billing period is stored anywhere in the schema, so
                    the cadence is not claimed here — only the ceiling and
                    how much autonomy the agent has. */}
                <p className="text-[11px] text-slate-400">
                  ceiling · {row.mode}
                </p>
              </div>

              <span
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700"
                title="Approved once and running until you remove it."
              >
                Active
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
