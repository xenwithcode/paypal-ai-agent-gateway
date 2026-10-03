// app/(app)/fx/FxShieldView.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, RefreshCw, TriangleAlert } from "lucide-react";
import EmptyState from "../components/EmptyState";
import { useFxShield } from "../hooks/useFxShield";
import {
  CURRENCIES,
  convert,
  formatAsOf,
  formatSmart,
  type FxCurrency,
  type FxSnapshot,
} from "@/lib/fx/rates";

interface Props {
  /** Pre-formatted PYUSD balance, read server-side so the secret never reaches the browser. */
  initialBalance: string;
  /** True only when the figure above was actually returned by PayPal. */
  balanceIsLive: boolean;
  /** Why it is a demo figure, shown to the operator rather than left in a log. */
  balanceReason?: string | null;
}

/** "2,480.00" → 2480 */
function parsePyusd(formatted: string): number {
  const n = Number(String(formatted).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const CONVERTIBLE: FxCurrency[] = ["VES", "PYUSD", "SOL"];

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: FxSnapshot }
  | { kind: "error"; message: string };

/**
 * Days between the two BCV publications behind `changePct`. The figure is a
 * per-publication change, not a daily one — dividing it out avoids promising a
 * daily loss the data does not support.
 */
function dailyChangePct(r: FxSnapshot): number | null {
  if (r.vesChangePct === undefined || !r.previousVesAsOf) return null;
  const days =
    (new Date(r.vesPerUsdAsOf).getTime() - new Date(r.previousVesAsOf).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) return null;
  return r.vesChangePct / days;
}

export default function FxShieldView({ initialBalance, balanceIsLive, balanceReason }: Props) {
  const { enabled } = useFxShield();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const [amount, setAmount] = useState("1000000");
  const [from, setFrom] = useState<FxCurrency>("VES");
  const [to, setTo] = useState<FxCurrency>("PYUSD");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/fx", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      setState({ kind: "ready", data: (await res.json()) as FxSnapshot });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rates = state.kind === "ready" ? state.data : null;

  // Balance context. PayPal only custodies PYUSD: VES sits in a bank account
  // and SOL would need a wallet, so a quote from either cannot be executed
  // against anything we track. Saying so beats silently implying a swap.
  const availablePyusd = parsePyusd(initialBalance);
  const amountNumber = Number(amount);
  const fromIsTracked = from === "PYUSD";
  const exceedsBalance =
    fromIsTracked && Number.isFinite(amountNumber) && amountNumber > availablePyusd;

  const quote = useMemo(() => {
    if (!rates) return null;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return null;
    return {
      result: convert(value, from, to, rates),
      rate: convert(1, from, to, rates),
    };
  }, [rates, amount, from, to]);

  const loss = useMemo(() => {
    if (!rates || from !== "VES") return null;
    const perDay = dailyChangePct(rates);
    const value = Number(amount);
    if (perDay === null || !Number.isFinite(value) || value <= 0) return null;
    // What the holding is worth after 30 days of the observed trend.
    return {
      perDayPct: perDay,
      in30Days: value * Math.pow(1 - perDay / 100, 30),
      amount: value,
    };
  }, [rates, amount, from]);

  return (
    <>
      <header className="px-6 pt-8 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">FX Shield</h1>
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
              Converts a balance that would otherwise lose value in a devaluing currency into
              PYUSD the moment it arrives — and converts it back at the moment you actually spend.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      <div className="space-y-8 px-6 pb-10 pt-6 md:px-8">
        {/* ── Live rates ─────────────────────────────────────────── */}
        <section aria-labelledby="live-rates">
          <h2 id="live-rates" className="text-base font-semibold text-slate-900">
            Live rates
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm text-slate-500">
            Every figure below is fetched from its publisher on demand. Nothing here is stored,
            rounded to look tidy, or assumed.
          </p>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {state.kind === "loading" && (
              <p className="px-4 py-6 text-sm text-slate-500">Loading published rates…</p>
            )}

            {state.kind === "error" && (
              <div className="flex items-start gap-3 px-4 py-5">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Rate feed unavailable</p>
                  <p className="mt-1 break-words text-xs text-red-600">{state.message}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    No conversion is offered while the official rate cannot be read — a wrong rate
                    would be worse than none.
                  </p>
                </div>
              </div>
            )}

            {rates && (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Published exchange rates</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-4 py-3 font-semibold">Rate</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Value</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Change</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Source</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Published</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                      BCV official <span className="font-normal text-slate-400">VES / USD</span>
                    </th>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {formatSmart(rates.vesPerUsd, "VES")}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${(rates.vesChangePct ?? 0) >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {rates.vesChangePct !== undefined ? `${rates.vesChangePct >= 0 ? "+" : ""}${rates.vesChangePct.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">dolarvzla · BCV</td>
                    <td className="px-4 py-3 text-slate-500">{formatAsOf(rates.vesPerUsdAsOf)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                      Intervention <span className="font-normal text-slate-400">VES / USD</span>
                    </th>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {rates.vesPerUsdIntervention !== undefined ? formatSmart(rates.vesPerUsdIntervention, "VES") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">—</td>
                    <td className="px-4 py-3 text-slate-500">dolarvzla · BCV</td>
                    <td className="px-4 py-3 text-slate-500">
                      {rates.interventionAsOf ? formatAsOf(rates.interventionAsOf) : "—"}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                      Solana <span className="font-normal text-slate-400">USD / SOL</span>
                    </th>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {Number.isFinite(rates.solPerUsd) ? formatSmart(rates.solPerUsd, "USD") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">—</td>
                    <td className="px-4 py-3 text-slate-500">CoinGecko</td>
                    <td className="px-4 py-3 text-slate-500">live</td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                      PYUSD peg <span className="font-normal text-slate-400">USD / PYUSD</span>
                    </th>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {Number.isFinite(rates.pyusdPerUsd) ? rates.pyusdPerUsd.toFixed(6) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">—</td>
                    <td className="px-4 py-3 text-slate-500">CoinGecko</td>
                    <td className="px-4 py-3 text-slate-500">live</td>
                  </tr>
                </tbody>
              </table>
            )}

            {rates && rates.errors.length > 0 && (
              <p className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                Partial data — {rates.errors.join("; ")}
              </p>
            )}
          </div>

          {rates && (
            <p className="mt-2 text-xs text-slate-400">
              The gap between the official and intervention rate is the actual problem this module
              exists to work around.
            </p>
          )}
        </section>

        {/* ── Converter ─────────────────────────────────────────── */}
        <section aria-labelledby="converter">
          <h2 id="converter" className="text-base font-semibold text-slate-900">
            Convert
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm text-slate-500">
            Quote only — no funds move here. The rate and its publication date are shown before
            any figure you might act on.
          </p>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="mb-1 block text-xs font-medium text-slate-600">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!rates}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm tabular-nums text-slate-900 outline-none transition focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">From</span>
                <select
                  value={from}
                  onChange={(e) => setFrom(e.target.value as FxCurrency)}
                  disabled={!rates}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none transition focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {CONVERTIBLE.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value as FxCurrency)}
                  disabled={!rates}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none transition focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {CURRENCIES.filter((c) => c !== from).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* What the user actually holds — shown because a converter that
                ignores the balance reads as broken. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                Your balance:{" "}
                <strong className="font-mono tabular-nums text-slate-900">
                  {initialBalance} PYUSD
                </strong>
                {!balanceIsLive && (
                  <span
                    title={balanceReason ?? "Demo figure — no live data."}
                    className="ml-2 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700"
                  >
                    demo
                  </span>
                )}
              </span>
              <span className="text-slate-400">Quote only — no funds move</span>
            </div>

            {!fromIsTracked && (
              <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                PayPal custodies your balance in PYUSD only. {from} is not held here — VES sits in
                your bank account and SOL would need a wallet — so this is a rate quote, not an
                executable swap.
              </p>
            )}

            {exceedsBalance && (
              <p
                role="alert"
                className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
              >
                Exceeds your available balance by{" "}
                {formatSmart(amountNumber - availablePyusd, "PYUSD")} PYUSD.
              </p>
            )}

            <div className="mt-5 border-t border-slate-100 pt-4">
              {quote ? (
                <>
                  <p className="text-xs text-slate-500">
                    {formatSmart(Number(amount), from)} {from} ≈
                  </p>
                  <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900">
                    {formatSmart(quote.result, to)} <span className="text-lg text-slate-400">{to}</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    at {formatSmart(quote.rate, from)} {from} per {to}
                    {rates && ` · BCV ${formatAsOf(rates.vesPerUsdAsOf)} · CoinGecko live`}
                  </p>

                  {loss && (
                    <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
                      Left in VES at the observed {loss.perDayPct.toFixed(2)}% per publication cycle,
                      {" "}{formatSmart(loss.amount, "VES")} VES would be worth about{" "}
                      <strong className="font-semibold">{formatSmart(loss.in30Days, "VES")} VES</strong>{" "}
                      in 30 days — a loss of{" "}
                      <strong className="font-semibold">
                        {formatSmart(loss.amount - loss.in30Days, "VES")} VES
                      </strong>.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  {rates ? "Enter an amount to see the quote." : "Waiting for live rates."}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Shield state ──────────────────────────────────────── */}
        <section aria-labelledby="shield-state">
          <h2 id="shield-state" className="text-base font-semibold text-slate-900">
            Protection
          </h2>
          <div className="mt-4">
            {enabled ? (
              <EmptyState
                icon={Coins}
                title="FX Shield is on"
                description="Any VES that lands is converted to PYUSD automatically so inflation cannot erode it while it sits. Your local payment rails are unlocked."
                action={{ label: "Open Pago Móvil", href: "/fx/pago-movil" }}
              />
            ) : (
              <EmptyState
                icon={Coins}
                title="FX Shield is off"
                description="Turn it on in the sidebar to convert an incoming VES balance automatically and unlock the local payment rails."
                note="This section is optional. If your currency is stable and freely convertible, you never need to switch it on — the rates above and the rest of the product work the same either way."
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
