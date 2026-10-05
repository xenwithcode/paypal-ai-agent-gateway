// app/(app)/commerce/CommerceView.tsx
"use client";

import { useEffect, useState } from "react";
import { ScrollText, Braces } from "lucide-react";
import { readPolicyRows, type ManifestRow } from "@/lib/history";
import EmptyState from "../components/EmptyState";

/**
 * The manifest behind every order the operator has drafted.
 *
 * A manifest is the record a machine reads, so it is shown as fields and as
 * JSON rather than as prose — the structure *is* the product here. It is read
 * after mount for the same reason the ledger is: the server rendering this
 * page has no browser storage to look in.
 */

const STATUS_TONE: Record<string, string> = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Captured: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Reserved: "border-blue-200 bg-blue-50 text-blue-700",
  Protecting: "border-blue-200 bg-blue-50 text-blue-700",
  "Awaiting approval": "border-amber-200 bg-amber-50 text-amber-700",
  Released: "border-slate-200 bg-slate-50 text-slate-500",
};

function Field({
  label,
  value,
  empty,
}: {
  label: string;
  value: string;
  empty?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-slate-400">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right ${empty ? "italic text-slate-300" : "text-slate-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ManifestCard({ row }: { row: ManifestRow }) {
  // ceiling, currency and status are guaranteed by `looksLikeManifest`; the
  // rest are genuinely optional and render as absent rather than invented.
  const ceiling = `${row.limit.toFixed(2)} ${row.currency}`;
  const condition = row.condition?.trim() ?? "";
  const expires = row.expires?.trim() ?? "";
  const endpoint = row.allowEndpoint?.trim() ?? "";
  // Absent on rows written before this field existed; it renders as absent
  // rather than as an empty restriction, the same way the endpoint does.
  const payee = row.payee?.trim() ?? "";
  const status = row.status;

  const payload = {
    what: row.what,
    merchant: row.merchant || null,
    ceiling: { amount: row.limit, currency: row.currency },
    condition: condition || null,
    valid_until: expires || null,
    mode: row.mode ?? null,
    // The recipient sits with the endpoint because they are the same question
    // asked twice: where may this order send money.
    payee: payee || null,
    allow_endpoint: endpoint || null,
    status,
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">
            {row.what ?? "Unnamed order"}
          </h3>
          <p className="truncate text-xs text-slate-400">
            {row.merchant || "no merchant named"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${STATUS_TONE[status] ?? "border-slate-200 bg-slate-50 text-slate-500"}`}
        >
          {status}
        </span>
      </header>

      <dl className="divide-y divide-slate-50 px-5 font-mono text-xs">
        <Field label="ceiling" value={ceiling} />
        <Field
          label="condition"
          value={condition || "— spend now"}
          empty={!condition}
        />
        <Field label="valid_until" value={expires || "No expiry"} empty={!expires} />
        <Field label="mode" value={row.mode ?? "—"} empty={!row.mode} />
        <Field label="payee" value={payee || "no recipient set"} empty={!payee} />
        <Field
          label="allow_endpoint"
          value={endpoint || "no endpoint set"}
          empty={!endpoint}
        />
      </dl>

      {/* The payload as the machine would read it. Not printed: a terminal
          dump beside a table adds nothing on paper. */}
      <details className="border-t border-slate-100 px-5 py-3 print:hidden">
        <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Braces className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          View as JSON
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-300">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </article>
  );
}

export default function CommerceView() {
  const [rows, setRows] = useState<ManifestRow[] | null>(null);

  useEffect(() => {
    setRows(readPolicyRows());
  }, []);

  // Fixed height so content arriving after mount cannot push the page.
  return (
    <div className="min-h-[340px]">
      {rows === null ? null : rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No manifests yet"
          description="Draft an order from the Overview and its manifest appears here for review — the ceiling, the endpoint it may reach, and the condition that releases the money, all read back before anything is authorised."
          action={{ label: "Draft an order", href: "/overview" }}
          note="Manifests are read from this browser's local storage; they appear as soon as an order exists."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            {rows.length} manifest{rows.length === 1 ? "" : "s"} — the structured record behind each
            order, read from this browser.
          </p>
          {rows.map((row) => (
            <ManifestCard key={row.id ?? row.what ?? Math.random()} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
