// app/(app)/send/components/TransferPanel.tsx
"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Send, Wallet } from "lucide-react";
import { MODE, STATUS, type PolicyEnvelope } from "@/lib/policy";
import { appendPolicyRow, updatePolicyRow } from "@/lib/history";
// Type-only: erased before the bundle is built, so nothing from the
// server-only module — least of all a credential — reaches this file.
import type { Balance } from "@/lib/paypal";
import PayPalAuthorizeButton from "../../overview/components/PayPalAuthorizeButton";
// The figure at the top of this panel is read once, when the page renders.
// An authorization happens after that, here, in this browser.
import { usePaypalBalance } from "../../hooks/usePaypalBalance";

type Note = { kind: "ok" | "warn" | "error"; text: string };

const NOTE_STYLE: Record<Note["kind"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

/**
 * The shape PayPal's own order route accepts. Mirrors the pattern there rather
 * than inventing a looser one, so an address the server would refuse is caught
 * here first, with a message the operator can act on.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;

/**
 * The order being drafted, carrying the envelope it was drafted with.
 *
 * The envelope lives here rather than being rebuilt when PayPal is shown, so
 * the row written to storage, the card on screen and the object the server
 * judges are one thing instead of three that can drift apart. A recipient
 * edited after the draft would otherwise reach PayPal as a different order
 * from the one the operator read.
 */
type Draft = { id: number; envelope: PolicyEnvelope };

type Props = {
  currency: "USD" | "PYUSD";
  balance: Balance;
  /** Public client id; empty when the app has no PayPal credentials. */
  paypalClientId: string;
};

/**
 * One rail, one shape: name a recipient, set an amount, approve it.
 *
 * The order of operations is the whole design. The recipient is written into
 * the policy row *before* PayPal is ever shown, so the envelope an operator
 * approves already names the only account the money may land on — writing it
 * afterwards would be editing the agreement after agreeing to it. PayPal then
 * carries the same address into the order it creates, so the restriction
 * exists on both sides: in what the gateway will judge, and in what PayPal
 * will pay.
 *
 * The panel reports where it is; it never narrates a transfer that did not
 * happen.
 */
export default function TransferPanel({ currency, balance, paypalClientId }: Props) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [authorized, setAuthorized] = useState<{ authorizationId: string } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);

  // The balance as it stands now — re-read after something can have moved it.
  const { balance: liveBalance, refresh } = usePaypalBalance(balance);

  const push = (kind: Note["kind"], text: string) =>
    setNotes((prev) => [{ kind, text }, ...prev].slice(0, 5));

  const money = amount.trim();
  const value = Number(money);
  const amountValid = MONEY.test(money) && Number.isFinite(value) && value > 0;
  const email = recipient.trim();
  const emailValid = EMAIL.test(email);
  const ready = emailValid && amountValid;

  /** Write the envelope. Nothing is authorized here — this is the draft. */
  const handleDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (!emailValid) {
      push("error", "Enter the recipient's PayPal email address.");
      return;
    }
    if (!amountValid) {
      push("error", "Enter an amount greater than zero, with at most two decimals.");
      return;
    }

    const limit = Number(value.toFixed(2));
    const what = note.trim() || `Transfer to ${email}`;
    const id = Date.now();

    // Written once, here. The row in storage, the envelope on the card and
    // the object the server judges when PayPal is asked are all this object —
    // one agreement rendered in three places, instead of three that could
    // disagree about who may be paid.
    const envelope: PolicyEnvelope = {
      what,
      limit,
      currency,
      // No host: a transfer names an account, not an endpoint.
      allowEndpoint: "",
      payee: email,
      // No condition either: a transfer is either made or it is not, and
      // saying so is what keeps the row from reading as a purchase still
      // waiting on a price nobody set. It is also what lets the capture
      // settle on demand rather than wait for a condition that was never set.
      status: STATUS.pending,
      expires: "",
      mode: MODE.autonomous,
    };

    appendPolicyRow({
      id,
      ...envelope,
      merchant: "",
      condition: "",
      marketPrice: null,
      marketImage: null,
      conditionMet: true,
      conditionDetail: "No condition — executes immediately.",
    });

    setDraft({ id, envelope });
    push(
      "ok",
      `Order drafted for ${limit.toFixed(2)} ${currency} to ${email}. Nothing has been authorized yet.`
    );
  };

  /** PayPal approved: the reservation is real, so the row says Reserved. */
  const handleAuthorized = async (result: { orderId: string; authorizationId: string }) => {
    if (!draft) return;
    const changed = updatePolicyRow(draft.id, {
      status: STATUS.reserved,
      paypalOrderId: result.orderId,
      authorizationId: result.authorizationId,
    });
    if (changed === 0) {
      // Storage and this panel disagreed. Reporting it beats printing an
      // authorization that the grid will never show.
      push("error", "The order was not found in this browser, so nothing was recorded.");
      return;
    }
    setAuthorized({ authorizationId: result.authorizationId });
    push(
      "ok",
      `🔐 Authorized — ${draft.envelope.limit.toFixed(2)} ${currency} reserved for ${draft.envelope.payee}. No money has moved yet.`
    );

    // The figure above was read when this page rendered, and an authorization
    // happens after that. PayPal may book it as a hold or leave the total
    // alone — so this reports the number it found and attributes nothing to
    // it, and when nothing moved it says nothing at all rather than inventing
    // a reason for a figure that stayed put.
    const moved = await refresh();
    if (moved) {
      push("ok", `Account Balance is now ${moved.value} ${moved.currency} — re-read from PayPal.`);
    }
  };

  const reset = () => {
    setDraft(null);
    setAuthorized(null);
    setRecipient("");
    setAmount("");
    setNote("");
    push("ok", "Ready for the next transfer.");
  };

  const balanceLive = liveBalance.source === "live";

  return (
    <div className="mt-6 space-y-6">
      {/* Rail header: the figure and where it came from travel together. */}
      <div className="flex justify-between items-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Send {currency} to a PayPal account
          </h3>
          <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-slate-500">
            {currency === "USD"
              ? "Dollars out of your PayPal balance, to a person by their PayPal email. Nothing is converted — one dollar leaves, one dollar arrives."
              : "Stablecoin out of your balance, to another PayPal account, still PYUSD on arrival. It is pegged one to one with the dollar, so there is no rail in between and nothing to convert."}
          </p>
        </div>
        <div className="ml-4 shrink-0 text-right">
          <div
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 font-mono text-xs font-bold ${
              balanceLive
                ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                : "border-amber-200 bg-amber-100 text-amber-800"
            }`}
            title={balanceLive ? "Read from PayPal just now." : (liveBalance.reason ?? "Demo figure.")}
          >
            <Wallet className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {liveBalance.value} {liveBalance.currency}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {balanceLive ? "PayPal · live" : "demo figure"}
          </p>
          {liveBalance.currency !== currency && (
            <p
              className="mt-0.5 text-[10px] leading-tight text-amber-600"
              title="The balance PayPal reported and the currency this rail settles in are not the same, and neither is being rounded into the other."
            >
              balance held in {liveBalance.currency}
            </p>
          )}
        </div>
      </div>

      {!paypalClientId && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          No PayPal client id is configured, so an order can be drafted here but not approved.
          The row will wait in Overview exactly as this one does — no money is reserved without
          the approval step.
        </p>
      )}

      {!draft ? (
        <form
          onSubmit={handleDraft}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Who gets the money
          </h4>

          <div>
            <label htmlFor="tp-recipient" className="mb-1 block text-[11px] font-medium text-slate-600">
              Recipient — PayPal email address
            </label>
            <input
              id="tp-recipient"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="maria@example.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              maxLength={254}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tp-amount" className="mb-1 block text-[11px] font-medium text-slate-600">
                Amount ({currency})
              </label>
              <input
                id="tp-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="tp-note" className="mb-1 block text-[11px] font-medium text-slate-600">
                Note <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="tp-note"
                type="text"
                placeholder="Lunch on Friday"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* The amount leaves and the amount arrives are the whole quote, so
              both are on screen before the button rather than after it. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Recipient gets</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {amountValid ? `${value.toFixed(2)} ${currency}` : `0.00 ${currency}`}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-slate-500">You pay</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {amountValid ? `${value.toFixed(2)} ${currency}` : `0.00 ${currency}`}
              </span>
            </div>
            <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-[11px] text-slate-400">
              No conversion — this rail moves {currency} as {currency}, so the two figures are the
              same number by construction, not by assumption.
            </p>
          </div>

          <button
            type="submit"
            disabled={!ready}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Draft the transfer
          </button>
          <p className="text-center text-[11px] text-slate-400">
            Drafting writes the order and its recipient. It does not move or reserve anything.
          </p>
        </form>
      ) : (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {authorized ? "Authorized" : "Your envelope"}
          </h4>

          <dl className="space-y-1.5">
            {[
              ["Order", draft.envelope.what],
              ["Ceiling", `${draft.envelope.limit.toFixed(2)} ${currency}`],
              ["Recipient", draft.envelope.payee],
              ["Condition", "No condition — executes immediately"],
              ["Mode", MODE.autonomous],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-1">
                <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
                <dd className="min-w-0 truncate text-right text-sm font-medium text-slate-900">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {authorized ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="flex items-start gap-2 text-xs font-medium leading-relaxed text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>
                  Reserved, not moved. <span className="font-mono">{authorized.authorizationId}</span>{" "}
                  is the authorization; capture it from Overview when the money should settle, or
                  release it and the hold goes away.
                </span>
              </p>
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Send to someone else
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs leading-relaxed text-slate-600">
                The recipient is already inside this order. Approving below reserves{" "}
                <span className="font-mono font-semibold text-slate-900">
                  {draft.envelope.limit.toFixed(2)} {currency}
                </span>{" "}
                against it — and because the order names who may be paid, no other account can
                receive it.
              </p>
              <PayPalAuthorizeButton
                clientId={paypalClientId}
                amount={draft.envelope.limit.toFixed(2)}
                currency={currency}
                description={draft.envelope.what}
                customId={String(draft.id)}
                payeeEmail={draft.envelope.payee}
                // The same object the row was written from, so the server
                // judges exactly what this card showed.
                policy={draft.envelope}
                onAuthorized={handleAuthorized}
                onUnavailable={(reason) => push("error", reason)}
              />
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Discard and start over
              </button>
            </div>
          )}
        </div>
      )}

      {/* Outcome: reported where the action happened, not two pages away. */}
      <div aria-live="polite" className="space-y-2">
        {notes.map((note_, index) => (
          <p
            key={`${note_.kind}-${index}-${note_.text.slice(0, 12)}`}
            className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${NOTE_STYLE[note_.kind]}`}
          >
            {note_.text}
          </p>
        ))}
      </div>
    </div>
  );
}
