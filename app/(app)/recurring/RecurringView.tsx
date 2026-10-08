// app/(app)/recurring/RecurringView.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, CreditCard, Plus, RefreshCw, Repeat, ImageOff, X } from "lucide-react";
import { appendPolicyRow, readPolicyRows, removePolicyRow, type ManifestRow } from "@/lib/history";
import { MODE, STATUS, calendarDay } from "@/lib/policy";
import { scheduleFrom } from "@/lib/commerce/catalog";
import { describeCadence, describePrice, type PlanSummary, type PlansResult } from "@/lib/billingPlans";
import { ensureHydrated } from "@/lib/store";
import { readEvents, recordEvent } from "@/lib/events";
import EventConsole from "../components/EventConsole";
import VoiceFill from "./VoiceFill";
// Type-only: erasado antes de construir, igual que Balance en TransferPanel.
import type { SpokenService } from "@/lib/gemini";
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


/**
 * What this commitment is waiting for, and — the part that was missing —
 * **on whom**.
 *
 * Both halves matter. "In progress" covers two states that need opposite
 * things: a row awaiting approval is waiting on *you* and cannot be charged
 * until you act, while a scheduled one is waiting on the clock and needs
 * nothing from anybody. Printed the same, they are indistinguishable — which
 * is how a request made ten seconds ago reads as one that vanished.
 *
 * PayPal is not one of the waiters. Its answer arrives during approval, in
 * its own UI, in the moment you press it; after that nothing is pending on
 * that side. So the two possible answers to "whose response am I waiting
 * for?" are you, and the date.
 */
function waitingOn(row: ManifestRow): string | null {
  switch (row.status) {
    case "Awaiting approval":
      return "Waiting for your approval — nothing can be charged until you give it.";
    case "Reserved": {
      const due = scheduleFrom(row.condition);
      if (!due) return "Reserved · waiting on its condition.";
      return due <= calendarDay()
        ? "Due now — the agent settles it on its next pass."
        : `Due ${due} — the agent settles it that day.`;
    }
    case "Active":
      return "Running until you remove it.";
    case "Captured":
      return "Paid.";
    case "Released":
      return "Released — nothing was charged.";
    default:
      return null;
  }
}

export default function RecurringView() {
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
  /** Lo que se acaba de crear, para confirmarlo donde mismo en vez de mandar a otra página. */
  const [justAdded, setJustAdded] = useState<{ name: string; id: number } | null>(null);
  /** Lo mismo que ve Overview, persistido: lo que el agente hace encaja aquí. */
  const [events, setEvents] = useState<string[]>([]);

  /**
   * The plans PayPal already holds for this account, asked once on mount.
   *
   * `null` is deliberately a third state: *asking*. Rendering "no plans yet"
   * while the request is still in flight is how an empty list gets read as a
   * fact before it is one. Bumping `plansAsk` re-asks, which is the only
   * honest answer to a refused request.
   */
  const [plans, setPlans] = useState<PlansResult | null>(null);
  const [plansAsk, setPlansAsk] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Ask the store first: a browser that has never seen this app reads the
    // commitments the server has been holding, not an empty list.
    void ensureHydrated().then(() => {
      if (cancelled) return;
      setRows(readPolicyRows().filter(isCommitment));
      setEvents(readEvents());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = () => setRows(readPolicyRows().filter(isCommitment));

  // Ask PayPal for the account's plans. The payload is shaped here rather than
  // trusted: a response that is not the shape this screen reads is reported as
  // "could not ask", never rendered as an empty account.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let answer: PlansResult;
      try {
        const response = await fetch("/api/recurring/plans", { cache: "no-store" });
        const data = (await response.json()) as Partial<PlansResult> | null;
        answer =
          data && Array.isArray(data.plans)
            ? {
                plans: data.plans,
                source: data.source === "live" ? "live" : "unavailable",
                reason: typeof data.reason === "string" ? data.reason : null,
                total: typeof data.total === "number" ? data.total : null,
              }
            : {
                plans: [],
                source: "unavailable",
                reason: "The plans service returned something this screen cannot read.",
                total: null,
              };
      } catch {
        answer = { plans: [], source: "unavailable", reason: "The plans service did not answer.", total: null };
      }
      if (!cancelled) setPlans(answer);
    })();
    return () => {
      cancelled = true;
    };
  }, [plansAsk]);

  /**
   * Say it here as well as there.
   *
   * This section writes into the same record Overview's console keeps, which
   * is the whole point of showing one: an order added here is readable from
   * the dashboard, and a capture the agent settles over there appears here —
   * where the commitment was made — instead of nowhere.
   */
  /**
   * What the microphone said, into the fields — and only into the fields.
   *
   * Empty strings leave what is already there alone, so a recording that only
   * caught the service does not erase an amount typed a moment earlier. The
   * notice says the next step rather than congratulating: the point is that
   * there is a step left.
   */
  const fillFromVoice = (fields: SpokenService) => {
    setService(fields.service || service);
    if (fields.url) setUrl(fields.url);
    if (fields.amount) setAmount(fields.amount);
    if (fields.currency) setCurrency(fields.currency);
    if (fields.date) setDue(fields.date);
    setFormError(null);
    setNotice("Understood — check the fields, then add it.");
  };

  /**
   * Take a real plan into the form instead of typing its name and price.
   *
   * Only the fields the plan actually carries are filled. The URL is not one
   * of them — a PayPal plan does not say where the service lives, and
   * inventing a host here would bound a future payment to a guess.
   */
  const loadPlan = (plan: PlanSummary) => {
    if (plan.name) setService(plan.name);
    if (plan.price) setAmount(plan.price);
    if (plan.currency === "USD" || plan.currency === "PYUSD") setCurrency(plan.currency);
    setAdding(true);
    setFormError(null);
    setNotice(
      `Loaded “${plan.name}” from your PayPal plan ${plan.id}. The service URL and the due date are still yours to give.`
    );
  };

  const remember = (message: string) => {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    recordEvent(line);
    setEvents(readEvents());
  };

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
    remember(`✕ [RECURRING] "${row.what}" removed — it will not be charged again.`);
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

    // Stay here. The commitment lands in the list below, and sending them to
    // another page before they have watched it land is what made the last
    // attempt read as a form that simply vanished. Approval is the next step
    // and it is offered on the row that just appeared — the same card, the
    // same link, opened when they choose to open it.
    setAdding(false);
    setService("");
    setUrl("");
    setAmount("");
    setDue("");
    setFormError(null);
    refresh();
    setJustAdded({ name, id });
    remember(`➕ [RECURRING] "${name}" drafted — awaiting approval. Nothing can be charged yet.`);
  };

  const awaiting = (rows ?? []).filter((row) => row.status === "Awaiting approval").length;

  return (
    // Fixed height so the list arriving after mount cannot push the page.
    <div className="min-h-[340px] space-y-4">
      {justAdded && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <p className="text-xs leading-relaxed text-emerald-800">
            <strong className="font-semibold">&ldquo;{justAdded.name}&rdquo; added</strong> —
            drafted, not active. It is waiting for your approval, and nothing can be charged
            until you give it.
          </p>
          <Link
            href={`/overview?draft=${justAdded.id}`}
            className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
          >
            Review and approve &rarr;
          </Link>
        </div>
      )}
      {/* Always on screen. When it was conditional, opening the form
          unmounted this row — and taking the microphone button with it, which
          stopped the recording that had just started. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Repeat className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {rows === null
              ? "Loading commitments…"
              : rows.length === 0
                ? "Nothing committed yet."
                : `${rows.length} commitment${rows.length === 1 ? "" : "s"} — standing ones run until you remove them, scheduled ones settle on their date.${awaiting > 0 ? ` ${awaiting} waiting for your approval.` : ""}`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <VoiceFill
              onStart={() => setAdding(true)}
              onFilled={fillFromVoice}
              onError={setFormError}
            />
            {/* Hidden only while the form is open: it *is* the form's CTA,
                and offering it twice invites pressing the wrong one. */}
            {!adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                Add a service
              </button>
            )}
          </div>
        </div>

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
            const waiting = waitingOn(row);
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
                  {/* De quién espera, no solo qué estado tiene: los dos
                      estados "en curso" necesitan cosas opuestas y se leen
                      idénticos sin esta línea. */}
                  {waiting && (
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">{waiting}</p>
                  )}
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
                  {/* La pregunta "¿dónde la apruebo?" respondida en el sitio
                      donde apareció el compromiso, no en otra página. */}
                  {typeof row.id === "number" && row.status === "Awaiting approval" && (
                    <Link
                      href={`/overview?draft=${row.id}`}
                      title="Open the approval card — you decide before anything can be charged."
                      className="inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      Approve
                    </Link>
                  )}
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
      {/* Los planes que PayPal ya tiene para esta cuenta — leídos en vivo.
          Sección aparte y después: los compromisos son el contenido, esto es
          la materia prima de la que se cargan. */}
      <section
        aria-labelledby="plans-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="plans-heading"
              className="flex items-center gap-2 text-sm font-semibold text-slate-900"
            >
              <Repeat className="h-4 w-4 text-slate-400" strokeWidth={1.75} aria-hidden="true" />
              Plans in your PayPal account
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {plans === null
                ? "Asking PayPal for the billing plans on this account…"
                : plans.source === "unavailable"
                  ? "PayPal was not asked — so nothing here says whether the account has plans."
                  : plans.plans.length === 0
                    ? "PayPal was asked, and this account has no billing plans."
                    : `${plans.plans.length}${plans.total !== null ? ` of ${plans.total}` : ""} plan${plans.plans.length === 1 ? "" : "s"}, read live from PayPal.`}
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              plans === null
                ? "border-slate-200 bg-slate-50 text-slate-500"
                : plans.source === "unavailable"
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700"
            }`}
            title={
              plans?.source === "unavailable" && plans.reason
                ? plans.reason
                : "Read through GET /api/recurring/plans on the server — the credentials never reach this page."
            }
          >
            {plans === null ? "Asking" : plans.source === "unavailable" ? "Not asked" : "Live"}
          </span>
        </div>

        {plans === null && (
          <div className="mt-4 space-y-2" aria-hidden="true">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
        )}

        {plans !== null && plans.source === "unavailable" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs leading-relaxed text-amber-800">
              <strong className="font-semibold">Could not ask PayPal.</strong>{" "}
              {plans.reason ?? "No reason was returned."}
            </p>
            <button
              type="button"
              onClick={() => setPlansAsk((n) => n + 1)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <RefreshCw className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
              Ask again
            </button>
          </div>
        )}

        {plans !== null && plans.source === "live" && plans.plans.length === 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs leading-relaxed text-slate-600">
              <strong className="font-semibold">No billing plans on this account yet.</strong>{" "}
              That is an answer, not a failure — PayPal was asked and had none. You can still add a
              service above: the form drafts it, and you approve it before anything can be charged.
            </p>
            <button
              type="button"
              onClick={() => setPlansAsk((n) => n + 1)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <RefreshCw className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
              Ask again
            </button>
          </div>
        )}

        {plans !== null && plans.source === "live" && plans.plans.length > 0 && (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Plan
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Cadence
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Price
                    </th>
                    <th scope="col" className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plans.plans.map((plan) => (
                    <tr key={plan.id || plan.name}>
                      <td className="max-w-[260px] px-3 py-2.5">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {plan.name || "Unnamed plan"}
                        </p>
                        {plan.description && (
                          <p className="truncate text-[11px] text-slate-400">{plan.description}</p>
                        )}
                        <p className="truncate font-mono text-[10px] text-slate-400">{plan.id}</p>
                      </td>
                      <td
                        className="px-3 py-2.5 text-xs text-slate-600"
                        title={
                          plan.autoBillOutstanding
                            ? "PayPal retries an outstanding charge before failing the subscription."
                            : undefined
                        }
                      >
                        {describeCadence(plan)}
                        {plan.autoBillOutstanding && (
                          <span className="ml-1 text-[10px] text-slate-400">· auto-bills</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold tabular-nums text-slate-900">
                        {describePrice(plan)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          {plan.status || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => loadPlan(plan)}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:border-slate-900 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          title="Load this plan's name and price into the form above. The URL and the date stay yours."
                        >
                          Use this plan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Dicho en voz alta: la diferencia entre este estado y el anterior
                es una cabecera HTTP, y un juez que la quite verá una lista de
                nombres sin precio. */}
            <p className="mt-2 text-[10px] text-slate-400">
              Read with <code className="rounded bg-slate-100 px-1 py-0.5">Prefer: return=representation</code>.
              Without it PayPal answers with ids and links only — no billing cycle, no payment
              preferences, so a plan cannot say what it costs.
            </p>
          </>
        )}
      </section>

      {/* La caja agéntica. El mismo registro que Overview: este es el lado
          donde se pide, aquel donde se decide, y los dos leen lo mismo. */}
      <EventConsole
        events={events}
        title="🖥️ Agentic Event Console"
        emptyNote="Nothing yet — what you add or remove lands here, and so do the agent's decisions from Overview."
      />
    </div>
  );
}
