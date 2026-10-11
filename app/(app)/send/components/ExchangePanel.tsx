// app/(app)/send/components/ExchangePanel.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Lock, Users } from "lucide-react";
import { convert, formatAsOf, formatSmart, type FxCurrency, type FxSnapshot } from "@/lib/fx/rates";
import { appendPolicyRow } from "@/lib/history";
import {
  EXCHANGE_WINDOW_DAYS,
  legInstructions,
  prepareExchange,
  settlementRule,
  type ExchangeInput,
} from "@/lib/exchange";

/**
 * Exchange · USD ↔ VES — dollars on one side, bolívares on the other.
 *
 * The rail this replaces asked for a *recipient bank*, which is a field this
 * build cannot honour: no bank is connected and none will be. What it did
 * under a bank's name is what this screen does under its own:
 *
 *   · the **dollar leg is a PayPal order**, so it is PayPal that holds the
 *     money — this app holds the *permission* to move it, which is the
 *     product's thesis applied to a deal between two people;
 *   · the **bolívar leg happens between the two of them**, bank to bank. The
 *     screen prints the reference to read and stops there;
 *   · the dollars are captured only when **a person confirms the bolívares
 *     arrived**, and are released when the window closes — so neither side
 *     has to be trusted, because neither has to be paid first.
 *
 * Reported here rather than in the Overview console: an exchange's outcome
 * belongs where the exchange is. The *order* it creates is Overview's, and
 * this panel links to it rather than duplicating the approval card.
 */
type Direction = "usd-for-ves" | "ves-for-usd";

/**
 * Which currency each side of the direction is counted in.
 *
 * Typed rather than inferred from a ternary: `convert` wants a currency it
 * recognises, and a `string` that happens to hold "USD" is not one it can be
 * given — the error says so, and this is where the answer belongs.
 */
const SIDES = {
  "usd-for-ves": { give: "USD", want: "VES" },
  "ves-for-usd": { give: "VES", want: "USD" },
} as const satisfies Record<Direction, { give: FxCurrency; want: FxCurrency }>;

const BANKS = [
  { code: "0102", name: "Banco de Venezuela" },
  { code: "0108", name: "Provincial" },
  { code: "0134", name: "Banesco" },
] as const;

function money(amount: number, digits = 2): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function ExchangePanel() {
  const [direction, setDirection] = useState<Direction>("usd-for-ves");
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [bank, setBank] = useState<string>("0134");
  const [phone, setPhone] = useState("");
  const [cedula, setCedula] = useState("");
  const [prepared, setPrepared] = useState<{ id: number; lines: string[] } | null>(null);

  // Live rates proxied through /api/fx (BCV + CoinGecko). If the feed is down
  // the exchange cannot be judged at all, so the panel says so rather than
  // quoting a number it remembered.
  const [rates, setRates] = useState<FxSnapshot | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fx");
        if (!res.ok) {
          throw new Error(res.status === 503 ? "rate feed unavailable" : `HTTP ${res.status}`);
        }
        const data = (await res.json()) as FxSnapshot;
        if (!cancelled) setRates(data);
      } catch (error) {
        if (!cancelled) setRatesError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const givingDollars = direction === "usd-for-ves";
  const side = SIDES[direction];
  const youGive = { amount: Number(amount) || 0, currency: side.give };
  const theyGive = {
    amount: rates ? convert(Number(amount) || 0, side.give, side.want, rates) : 0,
    currency: side.want,
  };

  const input: ExchangeInput = {
    youGive,
    theyGive,
    payee,
    local: { bank, phone, cedula },
    rate: rates ? { vesPerUsd: rates.vesPerUsd } : null,
  };

  // Judged on every keystroke rather than on submit: the violations are the
  // form's own labels, and a button that refuses without saying why is a
  // button the operator presses twice.
  const verdict = prepareExchange(input);

  const handlePrepare = (event: React.FormEvent) => {
    event.preventDefault();
    if (verdict.violations.length > 0) return;

    const id = Date.now();
    appendPolicyRow({
      id,
      what: verdict.what,
      limit: verdict.limit,
      currency: verdict.currency,
      status: verdict.status,
      merchant: "",
      // The bolívar leg's reference lives in the row so the approval card and
      // the audit trail can print it — the deal is checkable from the table.
      condition: verdict.condition,
      expires: verdict.expires,
      mode: verdict.mode,
      payee: verdict.payee,
      allowEndpoint: "",
      marketPrice: null,
      marketImage: null,
      conditionMet: null,
      conditionDetail: "A person confirms the bolívares arrived; no clock or price can.",
    });

    setPrepared({ id, lines: legInstructions(input, verdict) });
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Rate header: provenance travels with the number it belongs to. */}
      <div className="flex justify-between items-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Exchange · USD ↔ VES</h3>
          <p className="mt-1 max-w-[62ch] text-xs leading-relaxed text-slate-500">
            Dollars on one side, bolívares on the other, between two people who do not have to
            trust each other: <span className="font-medium text-slate-700">PayPal holds the
            dollars</span> as a hold, the bolívares go <span className="font-medium text-slate-700">
            between you two</span> by Pago Móvil, and the dollars are captured only when a person
            confirms they arrived. Nobody pays first.
          </p>
        </div>
        <div className="shrink-0 ml-4 text-right">
          {rates ? (
            <>
              <div className="rounded-md border border-blue-200 bg-blue-100 px-3 py-1 font-mono text-xs font-bold text-blue-800">
                {formatSmart(rates.vesPerUsd, "VES")} VES/USD
              </div>
              <p className="mt-1 text-[10px] text-slate-400">BCV · {formatAsOf(rates.vesPerUsdAsOf)}</p>
            </>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-100 px-3 py-1 font-mono text-xs font-bold text-amber-700">
              {ratesError ? "Rate unavailable" : "Loading rate…"}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handlePrepare} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* Direction: the same exchange, written from either side. */}
        <div>
          <span className="block text-[11px] font-medium text-slate-600">Which side are you on?</span>
          <div className="mt-1.5 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(
              [
                { key: "usd-for-ves", label: "I give dollars, I want bolívares" },
                { key: "ves-for-usd", label: "I give bolívares, I want dollars" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setDirection(option.key);
                  setPrepared(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                  direction === option.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="ex-amount" className="mb-1 block text-[11px] font-medium text-slate-600">
              You give ({youGive.currency})
            </label>
            <input
              id="ex-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-xs outline-none"
            />
          </div>
          <div>
            <label htmlFor="ex-payee" className="mb-1 block text-[11px] font-medium text-slate-600">
              Their PayPal account ({givingDollars ? "receives the bolívares' worth" : "sends the dollars"})
            </label>
            <input
              id="ex-payee"
              type="email"
              placeholder="counterparty@example.com"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none"
            />
          </div>
        </div>

        {/* The conversion, before the button: a quote nobody can check is not a quote. */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">They receive</span>
            <span className="font-mono font-semibold tabular-nums text-slate-900">
              {money(theyGive.amount)} {theyGive.currency}
            </span>
          </div>
          <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-[11px] text-slate-400">
            {rates
              ? `at ${formatSmart(rates.vesPerUsd, "VES")} VES/USD · BCV ${formatAsOf(rates.vesPerUsdAsOf)}`
              : ratesError
                ? "No live rate — an exchange cannot be judged until one is available"
                : "Waiting for a live rate…"}
          </p>
        </div>

        {/* The bolívar leg's reference: what the other person reads to check
            the deposit. Printed, never sent — no bank is on the other end of
            a wire this app can reach. */}
        <div>
          <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Their Pago Móvil reference · between you two
          </span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="ex-bank" className="mb-1 block text-[11px] font-medium text-slate-600">
                Bank
              </label>
              <select
                id="ex-bank"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none"
              >
                {BANKS.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.code} - {entry.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ex-phone" className="mb-1 block text-[11px] font-medium text-slate-600">
                Phone
              </label>
              <input
                id="ex-phone"
                type="tel"
                placeholder="04121234567"
                maxLength={15}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none"
              />
            </div>
            <div>
              <label htmlFor="ex-cedula" className="mb-1 block text-[11px] font-medium text-slate-600">
                Cédula
              </label>
              <input
                id="ex-cedula"
                type="text"
                placeholder="V-12345678"
                maxLength={12}
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Why it cannot be prepared, said before the button refuses. */}
        {verdict.violations.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            {verdict.violations.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={verdict.violations.length > 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
          Prepare this exchange
        </button>

        <p className="text-[11px] leading-relaxed text-slate-400">
          Nothing is charged here. Preparing writes the exchange as an order that waits for your
          approval — and the dollars are held by PayPal from that moment until you confirm the
          bolívares, or until {EXCHANGE_WINDOW_DAYS} days pass.
        </p>
      </form>

      {/* What was prepared: the instructions to read, and the two endings. */}
      {prepared && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Prepared · {verdict.what}
            </h4>
            <Link
              href={`/overview?draft=${prepared.id}`}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              Approve it in Overview →
            </Link>
          </div>

          {/* The dollar leg: held by PayPal, not by this app. */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Dollar leg · held by PayPal
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {money(verdict.limit)} {verdict.currency} to{" "}
              <span className="font-semibold text-slate-900">{verdict.payee}</span>, held from the
              moment you approve until you confirm the bolívares arrived — or released on{" "}
              <span className="font-semibold text-slate-900">{verdict.expires}</span>.
            </p>
          </div>

          {/* The bolívar leg: between the two of them, outside the app. */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Bolívar leg · between you two, outside this app
            </p>
            <ul className="mt-1.5 space-y-1 text-sm leading-relaxed text-slate-600">
              {prepared.lines.slice(1).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <ol className="space-y-1.5 text-xs leading-relaxed text-slate-500">
            {settlementRule().map((line, index) => (
              <li key={line}>
                <span className="font-semibold text-slate-700">{index + 1} · </span>
                {line}
              </li>
            ))}
          </ol>

          <p className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
            No QR yet: a QR that a bank app cannot read is decoration, so this screen prints the
            reference to read instead — the payload has to be verified against a real bank before
            one is drawn.
          </p>
        </div>
      )}
    </div>
  );
}
