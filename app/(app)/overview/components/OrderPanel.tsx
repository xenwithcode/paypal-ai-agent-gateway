// app/(app)/overview/components/OrderPanel.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { X, ImageOff, SearchX, Bot } from "lucide-react";
import { STATUS, type HoldAction, type PolicyEnvelope } from "@/lib/policy";
import type { CatalogProduct } from "@/lib/commerce/catalog";
import type { PolicyRow } from "../types";
import PayPalAuthorizeButton from "./PayPalAuthorizeButton";

/**
 * The approval card.
 *
 * ACP and UCP both put a structured card in front of the human before money
 * moves: real image, exact variant, live stock, then a button the agent
 * cannot press for you. This is that card, with the part those protocols do
 * not carry — the envelope the order has to stay inside. Seeing the product
 * tells you what you are buying; the ceiling, the endpoint and the condition
 * tell you what you are agreeing to.
 *
 * Everything is re-read from the catalog when the panel opens, so the price
 * being judged is the price right now rather than the one captured at draft.
 * Where the catalog publishes no figure — shipping cost, taxes — the row
 * says so instead of filling the gap with a plausible number.
 */

type Source = { name: string; kind: string; note?: string } | null;

type Evaluation = {
  product: CatalogProduct | null;
  conditionMet: boolean | null;
  conditionDetail: string;
  source: Source;
  /** Cheaper in-stock options in the same category, when the match is over budget. */
  alternatives: CatalogProduct[];
};

type Props = {
  row: PolicyRow;
  /** Public PayPal client id. Empty means the app has no credentials. */
  paypalClientId: string;
  onClose: () => void;
  onAction: (action: HoldAction, row: PolicyRow) => Promise<void> | void;
  /** Called once PayPal has approved and the hold is authorized for real. */
  onPaypalAuthorized: (
    row: PolicyRow,
    info: { orderId: string; authorizationId: string }
  ) => Promise<void> | void;
  /** Take up an in-budget product the agent found instead. */
  onUseAlternative: (row: PolicyRow, product: CatalogProduct) => void;
  /** Change the ceiling — the operator's own rule, stated with its new number. */
  onRaiseCeiling: (row: PolicyRow, limit: number) => void;
  /** Drop the order entirely. */
  onDiscard: (row: PolicyRow) => void;
};

function money(value: number, currency: string) {
  return `${value.toFixed(2)} ${currency}`;
}

/** The same three words the grid uses, so the two never disagree. */
function verdictWord(met: boolean | null) {
  return met === true ? "met" : met === false ? "NOT met" : "unverified";
}

function Field({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-sm font-medium ${tone}`}>{value}</dd>
    </div>
  );
}

export default function OrderPanel({
  row,
  paypalClientId,
  onClose,
  onAction,
  onPaypalAuthorized,
  onUseAlternative,
  onRaiseCeiling,
  onDiscard,
}: Props) {
  const [evaluating, setEvaluating] = useState(true);
  const [result, setResult] = useState<Evaluation | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * Why PayPal's own approval could not run, when it could not. Switching to
   * the plain button without saying why would turn a real failure into a
   * silent demo hold.
   */
  const [paypalNote, setPaypalNote] = useState<string | null>(null);

  /**
   * The envelope the server judges this order against.
   *
   * Built here rather than as a literal because PayPalAuthorizeButton keeps
   * it in its effect dependencies: a fresh object every render would tear the
   * PayPal button down and rebuild it whenever anything on the card changed.
   * Every field is the row's own — this card does not get to widen what the
   * grid says was approved.
   */
  const envelope = useMemo<PolicyEnvelope>(
    () => ({
      what: row.what,
      limit: row.limit,
      currency: row.currency,
      allowEndpoint: row.allowEndpoint,
      payee: row.payee ?? "",
      status: row.status,
      expires: row.expires,
      mode: row.mode,
    }),
    [row]
  );

  const evaluate = useCallback(async () => {
    setEvaluating(true);
    try {
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          policy: {
            id: row.id,
            what: row.what,
            merchant: row.merchant,
            condition: row.condition,
            limit: row.limit,
            currency: row.currency,
            status: row.status,
          },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Could not read this order.");

      setResult({
        product: data.product ?? null,
        conditionMet: data.conditionMet ?? null,
        conditionDetail: data.conditionDetail ?? row.conditionDetail,
        source: data.source ?? null,
        alternatives: Array.isArray(data.alternatives) ? data.alternatives : [],
      });
      setImageFailed(false);
    } catch {
      // Fall back to what the row is already carrying. A card built on stale
      // data, marked as such below, beats an empty panel at the moment the
      // operator is trying to decide.
      setResult({
        product: null,
        conditionMet: row.conditionMet,
        conditionDetail: row.conditionDetail,
        source: null,
        alternatives: [],
      });
    } finally {
      setEvaluating(false);
    }
  }, [row]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  // Escape to dismiss, as any dialog expects.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const product = result?.product ?? null;
  const image = product?.thumbnail ?? row.marketImage;
  const price = typeof product?.price === "number" ? product.price : row.marketPrice;
  const conditionMet = result ? result.conditionMet : row.conditionMet;
  const detail = result?.conditionDetail ?? row.conditionDetail;

  const overCeiling = typeof price === "number" && price > row.limit;
  const conditionText = row.condition.trim();
  const expiry = row.expires.trim() || "No expiry";

  const isReserved = row.status === STATUS.reserved;
  const metNow = conditionMet === true;
  const isDone = row.status === STATUS.captured || row.status === STATUS.released;

  const run = async (action: HoldAction) => {
    setBusy(true);
    try {
      await onAction(action, row);
      // The row has moved; re-read it so the card shows the new state rather
      // than the one the button was pressed against.
      await evaluate();
    } finally {
      setBusy(false);
    }
  };

  /**
   * The moment the agent has to say no: the product exists but costs more
   * than the operator allowed. Only offered while nothing has been approved,
   * and only when there really is a product to talk about. `overCeiling` is
   * computed above and shared with the envelope, so the message and the
   * number in the table can never disagree.
   */
  const alternatives = result?.alternatives ?? [];
  const agentPrompt =
    row.status === STATUS.pending && overCeiling && product
      ? { product, alternatives, overBy: Number((price - row.limit).toFixed(2)) }
      : null;

  /**
   * Whether this row may be thrown away at all.
   *
   * Offered only where nothing is at stake: an order nobody approved, a hold
   * that was already cancelled, an allowance being switched off. Withheld
   * from a live reservation, because discarding that would strand an
   * authorization PayPal still holds without voiding it — and from a settled
   * order, because this row *is* the purchase record Activity reads, so
   * deleting it would erase a completed transaction from the history.
   *
   * The button used to exist only inside the over-ceiling branch, which left
   * every other row — Released above all, a terminal state — with no way out
   * of the table.
   */
  const canDiscard =
    row.status === STATUS.pending ||
    row.status === STATUS.released ||
    row.status === STATUS.enforced;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 py-10 backdrop-blur-sm sm:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Order: ${row.what}`}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Order awaiting your decision
            </p>
            <h2 className="mt-0.5 truncate text-lg font-bold text-slate-900">{row.what}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                isReserved
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : isDone
                    ? "border-slate-200 bg-white text-slate-500"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {row.status}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {/* ── Product ──────────────────────────────────────────── */}
          <section className="border-b border-slate-100 px-6 py-5">
            <div className="flex gap-4">
              <div className="h-28 w-28 shrink-0">
                {image && !imageFailed ? (
                  <Image
                    src={image}
                    alt={row.what}
                    width={224}
                    height={224}
                    onError={() => setImageFailed(true)}
                    className="h-28 w-28 rounded-xl border border-slate-200 bg-white object-cover"
                  />
                ) : (
                  <div className="flex h-28 w-28 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                    <ImageOff className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                    <span className="px-2 text-center text-[10px] leading-tight">
                      {product ? "Image unavailable" : "No catalog match"}
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {evaluating ? (
                  <div className="space-y-2" aria-live="polite">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                    <span className="sr-only">Reading the catalog…</span>
                  </div>
                ) : product ? (
                  <>
                    <p className="truncate text-sm font-semibold text-slate-800">{product.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {[product.brand, product.category].filter(Boolean).join(" · ")}
                    </p>

                    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-2xl font-bold tabular-nums text-slate-900">
                        {money(product.price, product.currency)}
                      </span>
                      {product.discountPercentage > 0 && (
                        <span className="text-xs font-semibold text-emerald-600">
                          {product.discountPercentage.toFixed(2)}% off
                        </span>
                      )}
                      {product.rating > 0 && (
                        <span className="text-xs text-slate-500">
                          ★ {product.rating.toFixed(2)}
                          {product.reviewCount > 0 ? ` (${product.reviewCount} reviews)` : ""}
                        </span>
                      )}
                    </div>

                    <dl className="mt-3 space-y-0.5 text-xs text-slate-600">
                      <div className="flex gap-2">
                        <dt className="text-slate-400">Availability</dt>
                        <dd className="font-medium">
                          {product.availabilityStatus}
                          {product.stock > 0 ? ` · ${product.stock} available` : ""}
                        </dd>
                      </div>
                      {product.shippingInformation && (
                        <div className="flex gap-2">
                          <dt className="text-slate-400">Ships</dt>
                          <dd className="font-medium">{product.shippingInformation}</dd>
                        </div>
                      )}
                      {(product.returnPolicy || product.warrantyInformation) && (
                        <div className="flex gap-2">
                          <dt className="text-slate-400">Returns</dt>
                          <dd className="font-medium">
                            {[product.returnPolicy, product.warrantyInformation]
                              .filter(Boolean)
                              .join(" · ")}
                          </dd>
                        </div>
                      )}
                      {product.sku && (
                        <div className="flex gap-2">
                          <dt className="text-slate-400">SKU</dt>
                          <dd className="font-medium">{product.sku}</dd>
                        </div>
                      )}
                    </dl>

                    {/* Named, not implied: the catalog sells fiction and
                        publishes no shipping price or tax rate. Leaving the
                        row out would read as "there are none"; filling it in
                        would read as "it is free". */}
                    <dl className="mt-3 space-y-0.5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                      <div className="flex gap-2">
                        <dt className="text-slate-400">Shipping cost</dt>
                        <dd className="italic text-slate-400">not provided by this catalog</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-slate-400">Taxes</dt>
                        <dd className="italic text-slate-400">not provided by this catalog</dd>
                      </div>
                    </dl>

                    <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                      Catalog: {result?.source?.name ?? "dummyjson"} ·{" "}
                      {result?.source?.kind ?? "demo-catalog"} — fictional products, live API
                      responses.
                    </p>
                  </>
                ) : (
                  <div className="flex h-28 flex-col justify-center gap-1.5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <SearchX className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      No catalog match
                    </p>
                    <p className="max-w-[46ch] text-xs leading-relaxed text-slate-500">
                      Nothing was found for this order, so its condition cannot be checked. It will
                      read <span className="font-medium text-slate-700">unverified</span> rather than
                      passed — an unanswerable condition never counts as satisfied.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── The envelope: what this order is allowed to do ───── */}
          <section className="border-b border-slate-100 px-6 py-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Your envelope
            </h3>
            <dl className="mt-2 divide-y divide-slate-100">
              <Field
                label="Ceiling"
                value={`${money(row.limit, row.currency)}${overCeiling ? " · exceeded" : ""}`}
                tone={overCeiling ? "text-red-700" : "text-emerald-700"}
              />
              <Field
                label="Condition"
                value={
                  conditionText
                    ? `${conditionText} · ${verdictWord(conditionMet)}`
                    : "— spend now"
                }
                tone={
                  !conditionText
                    ? "italic text-slate-400"
                    : conditionMet === false
                      ? "text-red-700"
                      : conditionMet === true
                        ? "text-emerald-700"
                        : "text-slate-500"
                }
              />
              <Field
                label="May only pay"
                value={row.payee?.trim() || "no recipient set"}
                tone={row.payee?.trim() ? "font-mono text-slate-900" : "italic text-slate-400"}
              />
              <Field
                label="May only reach"
                value={row.allowEndpoint || "no endpoint set"}
                tone={row.allowEndpoint ? "" : "italic text-slate-400"}
              />
              <Field
                label="Valid until"
                value={expiry}
                tone={row.expires.trim() ? "" : "italic text-slate-400"}
              />
              <Field label="Mode" value={row.mode} />
            </dl>

            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
              {detail}
            </p>
          </section>

          {/* ── Human authorization ──────────────────────────────── */}
          <section className="px-6 py-5">
            {agentPrompt ? (
              /* The agent refuses to offer a button that would break the
                 ceiling, and offers what it can do instead. Every path keeps
                 the rule intact: a different product, an operator who changes
                 their own limit out loud, or nothing at all. */
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    <Bot className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    The agent found a problem
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    I could not find{" "}
                    <span className="font-semibold text-slate-900">{row.what}</span> at or below{" "}
                    <span className="font-mono font-semibold">{money(row.limit, row.currency)}</span>.
                    The closest match is{" "}
                    <span className="font-semibold text-slate-900">{agentPrompt.product.title}</span>{" "}
                    at{" "}
                    <span className="font-mono font-semibold">
                      {money(agentPrompt.product.price, agentPrompt.product.currency)}
                    </span>{" "}
                    — <span className="font-semibold text-red-700">{money(agentPrompt.overBy, row.currency)}</span>{" "}
                    over your ceiling.
                  </p>
                  {agentPrompt.alternatives[0] && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">
                      There is{" "}
                      <span className="font-semibold text-slate-900">
                        {agentPrompt.alternatives[0].title}
                      </span>{" "}
                      at{" "}
                      <span className="font-mono font-semibold text-emerald-700">
                        {money(agentPrompt.alternatives[0].price, agentPrompt.alternatives[0].currency)}
                      </span>{" "}
                      in the same category — inside your budget.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {agentPrompt.alternatives[0] && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onUseAlternative(row, agentPrompt.alternatives[0])}
                      className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:from-emerald-700 hover:to-green-700 disabled:opacity-60"
                    >
                      Buy {agentPrompt.alternatives[0].title} at{" "}
                      {money(agentPrompt.alternatives[0].price, agentPrompt.alternatives[0].currency)}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRaiseCeiling(row, Number(agentPrompt.product.price.toFixed(2)))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Raise the ceiling to{" "}
                    {money(agentPrompt.product.price, agentPrompt.product.currency)}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDiscard(row)}
                    className="w-full px-5 py-2 text-sm font-medium text-slate-400 transition hover:text-red-600 disabled:opacity-60"
                  >
                    Discard this order
                  </button>
                </div>

                <p className="text-center text-[11px] leading-relaxed text-slate-400">
                  Nothing is authorized until you choose a path and approve it with PayPal.
                </p>
              </div>
            ) : isDone ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-800">
                  {row.status === STATUS.captured
                    ? "Settled — the money has moved."
                    : "Released — the hold was cancelled."}
                </p>
              </div>
            ) : row.status === STATUS.enforced ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-800">
                  Active — a standing allowance up to {money(row.limit, row.currency)}.
                </p>
              </div>
            ) : row.status === STATUS.pending ? (
              (() => {
                // PayPal is only offered for orders that actually hold money.
                // A standing allowance reserves nothing, so there is nothing
                // for a payer to approve.
                const usePaypal = Boolean(conditionText && paypalClientId && !paypalNote);
                const note = !conditionText
                  ? "Turns this allowance on. The agent may spend up to the ceiling and no further."
                  : usePaypal
                    ? "PayPal asks you to approve the hold. The ceiling is reserved, not taken — money only moves once the condition is met and you capture it."
                    : paypalNote
                      ? `PayPal approval is unavailable (${paypalNote}). Activating records your decision without reserving anything.`
                      : "No PayPal credentials configured — activating records your decision without reserving anything.";

                return (
                  <div className="space-y-3">
                    {usePaypal ? (
                      <PayPalAuthorizeButton
                        clientId={paypalClientId}
                        amount={row.limit.toFixed(2)}
                        currency={row.currency}
                        description={row.what}
                        customId={`order-${row.id}`}
                        // The recipient the order names, carried into the
                        // order itself: the server compares this against the
                        // envelope's payee, so an order that may only pay one
                        // account cannot be opened aimed at another.
                        payeeEmail={row.payee ?? ""}
                        policy={envelope}
                        disabled={busy}
                        onAuthorized={(info) => onPaypalAuthorized(row, info)}
                        onUnavailable={(reason) => setPaypalNote(reason)}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run("activate")}
                        className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60"
                      >
                        {conditionText
                          ? `Authorize with PayPal AI Agent — hold ${money(row.limit, row.currency)}`
                          : "Authorize with PayPal AI Agent"}
                      </button>
                    )}
                    <p className="text-center text-[11px] leading-relaxed text-slate-400">{note}</p>
                  </div>
                );
              })()
            ) : isReserved && metNow ? (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run("capture")}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:from-emerald-700 hover:to-green-700 disabled:opacity-60"
                >
                  Pay securely with PayPal AI Agent
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run("release")}
                  className="w-full rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Release the hold instead
                </button>
              </div>
            ) : isReserved ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">
                    {conditionMet === false
                      ? "Not payable yet — the condition is not met."
                      : "Not payable yet — the condition cannot be verified."}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-700">
                    {conditionMet === false
                      ? "The hold stays in place and waits. Capture stays unavailable until the price satisfies the rule."
                      : "Nothing was found that can answer the condition, so the hold cannot be settled on a guess."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run("release")}
                  className="w-full rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Release the hold
                </button>
              </div>
            ) : null}

            {/* Throwing the row away. Offered here rather than only inside the
                over-ceiling branch, which is where it used to live — every
                other state, Released above all, had no way out of the table.
                The `!agentPrompt` guard keeps it from appearing twice when the
                agent's own three paths are on screen, one of which is discard. */}
            {canDiscard && !agentPrompt && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDiscard(row)}
                  className="text-sm font-medium text-slate-400 transition hover:text-red-600 disabled:opacity-60"
                >
                  Discard this order
                </button>
              </div>
            )}

            {/* Only when there genuinely are no credentials. It used to print
                for every row and every status, asserting a configuration the
                card cannot see — false for anyone who had keys, and nonsense
                beside a settled order. The line above already says what
                authorizing does, so there is nothing to add when the keys are
                there. */}
            {!paypalClientId && (
              <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-400">
                No PayPal credentials are configured, so authorizing records the decision
                without moving money.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
