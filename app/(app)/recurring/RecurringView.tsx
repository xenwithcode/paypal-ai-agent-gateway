// app/(app)/recurring/RecurringView.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CalendarDays, CreditCard, Plus, Repeat, ImageOff, X } from "lucide-react";
import { appendPolicyRow, readPolicyRows, removePolicyRow, type ManifestRow } from "@/lib/history";
import { MODE, STATUS } from "@/lib/policy";
import { scheduleFrom } from "@/lib/commerce/catalog";
import { ensureHydrated } from "@/lib/store";
import EmptyState from "../components/EmptyState";

/**
 * Commitments: allowances that run until they are removed, and payments due
 * on a date.
 *
 * Both belong here because both answer the same question — *what have I agreed
 * to keep paying?* — and they differ only in whether a date is attached. A
 * scheduled payment is a commitment with a day on it, so it is shown in every
 * state: the one awaiting approval is a commitment not yet made, and hiding it
 * here would leave the operator wondering where the thing they just added went.
 *
 * A date is stored as a condition (`on 2026-11-01`) rather than as a new
 * field, because that is what it is: a condition on when the money may move.
 * It gives the schedule three things a dedicated field would have to
 * re-derive — the grid prints it, the approval card shows what is being
 * approved, and the agent settles it when the day arrives, through the same
 * capture path as everything else.
 *
 * Cadence is still not stored. A monthly commitment that shows "due on the
 * 1st" says when the next one is, not that there will be another; claiming a
 * recurrence this build does not perform would be the sort of promise this
 * project keeps removing.
 *
 * Read after mount for the same reason every other stored view is: the server
 * rendering this page has no browser storage to look in.
 */

/** A commitment — a standing allowance, or anything with a day attached. */
function isCommitment(row: ManifestRow): boolean {
  // Scheduled rows count in whatever state they are in. An order awaiting
  // approval is a commitment already made in the operator's head, and a paid
  // one is a commitment worth seeing the receipt for.
  if (scheduleFrom(row.condition)) return true;
  return row.status === "Active" && !(row.condition ?? "").trim();
}

const STATUS_STYLE: Record<string, string> = {
  Active: "border-emerald-300 bg-emerald-50 text-emerald-700",
  Reserved: "border-blue-300 bg-blue-50 text-blue-700",
  Captured: "border-slate-300 bg-slate-100 text-slate-600",
  "Awaiting approval": "border-amber-300 bg-amber-50 text-amber-700",
  Released: "border-slate-300 bg-slate-50 text-slate-500",
};

/** The product's own picture, or a labelled placeholder — never a broken glyph. */
function RecurringThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
        <ImageOff className="h-5 w-5 text-slate-300" strokeWidth={1.75} aria-hidden="true" />
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

/** The host a URL points at, or null when it is not one. */
function hostOf(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return null;
  }
}

const SERVICE_HINTS = [
  "Netflix",
  "Spotify Premium",
  "Amazon Prime Video",
  "iCloud+",
  "GitHub Pro",
  "ChatGPT Plus",
  "YouTube Premium",
];

export default function RecurringView() {
  const router = useRouter();
  const [rows, setRows] = useState<ManifestRow[] | null>(null);
  /** The row waiting for a second click. Nothing is removed on the first. */
  const [confirming, setConfirming] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [service, setService] = useState("");
  const [url, setUrl] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [due, setDue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Ask the store first: a browser that has never seen this app reads the
    // commitments the server has been holding, not an empty list.
    void ensureHydrated().then(() => {
      if (cancelled) return;
      setRows(readPolicyRows().filter(isCommitment));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = () => setRows(readPolicyRows().filter(isCommitment));

  const remove = (row: ManifestRow) => {
    if (typeof row.id !== "number") return;

    if (confirming !== row.id) {
      setConfirming(row.id);
      setNotice(null);
      return;
    }

    const removed = removePolicyRow(row.id);
    setConfirming(null);
    if (removed === 0) {
      // Storage and the view disagreed — say so rather than pretend it went.
      setNotice("That order was already gone. The list has been refreshed.");
      refresh();
      return;
    }

    setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
    setNotice(`Removed "${row.what}". It will not be charged again.`);
  };

  /**
   * Draft the commitment and take the operator to its approval.
   *
   * The row lands as *Awaiting approval* — never straight to Active. A
   * recurring charge that starts existing because somebody filled in a form is
   * exactly what this product exists to prevent, so the form ends where every
   * other order ends: the card that asks.
   */
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const name = service.trim();
    if (!name) {
      setFormError("Name the service — that is what you will recognise it by.");
      return;
    }

    const host = hostOf(url);
    if (!host) {
      setFormError("That is not a URL. It is where the payment goes, so it has to be one.");
      return;
    }

    const value = Number(amount.trim());
    if (!amount.trim() || !Number.isFinite(value) || value <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }

    if (!due) {
      setFormError("Pick the date this payment is due.");
      return;
    }

    // Captured once: two calls would be two different milliseconds, and the
    // approval card would open for an id no row has.
    const id = Date.now();

    appendPolicyRow({
      id,
      what: name,
      merchant: host,
      limit: Number(value.toFixed(2)),
      currency,
      // The schedule is stored as the condition it is. The agent may settle
      // this the day it is due and not before, which is what makes a date on
      // a form mean something instead of being a note.
      condition: `on ${due}`,
      expires: "",
      mode: MODE.autonomous,
      status: STATUS.pending,
      // No recipient is named: a bill goes to the service, and the endpoint
      // below is what bounds where. Naming a PayPal account here would
      // restrict the payment to one address this form never asked for.
      payee: "",
      allowEndpoint: host,
      marketPrice: null,
      marketImage: null,
      // Not yet judged: the day has not come, so nothing has answered.
      conditionMet: null,
      conditionDetail: `Due on ${due}.`,
    });

    router.push(`/overview?draft=${id}`);
  };

  return (
    // Fixed height so the list arriving after mount cannot push the page.
    <div className="min-h-[340px] space-y-4">
      {!adding ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Repeat className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {rows === null
              ? "Loading commitments…"
              : rows.length === 0
                ? "Nothing committed yet."
                : `${rows.length} commitment${rows.length === 1 ? "" : "s"} — standing ones run until you remove them, scheduled ones settle on their date.`}
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
            Add a service
          </button>
        </div>
      ) : null}

      {adding && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Add a recurring service</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              It is drafted, not activated: you will see what you are agreeing to before anything
              can be charged.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rec-service" className="mb-1 block text-[11px] font-medium text-slate-600">
                Service type
              </label>
              <input
                id="rec-service"
                list="rec-services"
                type="text"
                placeholder="Netflix"
                value={service}
                onChange={(e) => setService(e.target.value)}
                maxLength={120}
                autoComplete="off"
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <datalist id="rec-services">
                {SERVICE_HINTS.map((hint) => (
                  <option key={hint} value={hint} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="rec-url" className="mb-1 block text-[11px] font-medium text-slate-600">
                Service URL
              </label>
              <input
                id="rec-url"
                type="text"
                inputMode="url"
                placeholder="netflix.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={200}
                autoComplete="off"
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Becomes the only host this order may reach.
              </p>
            </div>

            <div>
              <label htmlFor="rec-amount" className="mb-1 block text-[11px] font-medium text-slate-600">
                Amount
              </label>
              <div className="flex gap-2">
                <input
                  id="rec-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <select
                  aria-label="Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="USD">USD</option>
                  <option value="PYUSD">PYUSD</option>
                </select>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Stored as the ceiling — no charge can exceed it.
              </p>
            </div>

            <div>
              <label htmlFor="rec-due" className="mb-1 block text-[11px] font-medium text-slate-600">
                Next payment
              </label>
              <input
                id="rec-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                The agent may settle it on this date and not before.
              </p>
            </div>
          </div>

          {formError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              Add service
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows !== null && rows.length === 0 && !adding ? (
        <EmptyState
          icon={CreditCard}
          title="No recurring payments yet"
          description="Add a service — its type, its URL, the amount and the date it is due. It is drafted first, so you approve what you are agreeing to before anything can be charged."
          action={{ label: "Add a service", onClick: () => setAdding(true) }}
          note="Standing allowances approved from Overview appear here too, and can be removed from this page."
        />
      ) : null}

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
        >
          {notice}
        </p>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => {
            const isConfirming = confirming === row.id;
            const dueDate = scheduleFrom(row.condition);
            const settled = row.status === "Captured";
            return (
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
                  {/* The cadence is still not stored — only the ceiling and
                      the next date. "Monthly" would be a promise this build
                      does not perform. */}
                  <p className="text-[11px] text-slate-400">ceiling · {row.mode}</p>
                </div>

                {dueDate && (
                  <p className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-600">
                    <CalendarDays className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
                    {settled ? "paid" : "due"} {dueDate}
                  </p>
                )}

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                      STATUS_STYLE[row.status] ?? "border-slate-300 bg-slate-50 text-slate-500"
                    }`}
                    title={
                      row.status === "Awaiting approval"
                        ? "Drafted. Nothing can be charged until you approve it."
                        : row.status === "Reserved"
                          ? "Approved, and waiting for the day it is due."
                          : undefined
                    }
                  >
                    {row.status}
                  </span>

                  {/* A settled row is history: removing it would erase the
                      receipt, and this page is not where history lives. */}
                  {!settled && (
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      onBlur={() => setConfirming((current) => (current === row.id ? null : current))}
                      aria-label={isConfirming ? `Confirm removing ${row.what}` : `Remove ${row.what}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                        isConfirming
                          ? "border-red-300 bg-red-600 text-white"
                          : "border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:text-red-600"
                      }`}
                      title={
                        isConfirming
                          ? "Click again to remove this commitment for good."
                          : "Stop this commitment. It will not be charged again."
                      }
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                      {isConfirming ? "Confirm" : "Remove"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
