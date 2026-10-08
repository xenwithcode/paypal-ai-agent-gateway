// app/(app)/send/components/PagoMovilPanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { convert, formatAsOf, formatSmart, type FxSnapshot } from "@/lib/fx/rates";

type Note = { kind: "ok" | "warn" | "error"; text: string };

const NOTE_STYLE: Record<Note["kind"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

/**
 * Pago Móvil off-ramp: PYUSD into a Venezuelan bank account, plus a merchant
 * QR scan.
 *
 * Every figure comes from the live BCV feed; nothing is hardcoded. What this
 * panel deliberately does NOT do is pretend to have moved money — with no
 * PayPal credentials configured there is no transfer, and the result says so
 * rather than printing a reference number for one. It reports locally instead
 * of writing to the Overview console, because a transfer's outcome belongs
 * where the transfer is, not two pages away.
 */
export default function PagoMovilPanel() {
  const [phone, setPhone] = useState("");
  const [cedula, setCedula] = useState("");
  const [bank, setBank] = useState("0102");
  const [amount, setAmount] = useState("");
  const [qrSimulated, setQrSimulated] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  /** The pending animation timer, so a second scan replaces it and unmount cancels it. */
  const qrTimer = useRef<number | undefined>(undefined);

  // Live rates proxied through /api/fx (BCV + CoinGecko). If the feed is down
  // we say so instead of inventing a number.
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

  const push = (kind: Note["kind"], text: string) =>
    setNotes((prev) => [{ kind, text }, ...prev].slice(0, 5));

  /** VES → PYUSD at the published BCV rate, or null while we have no rate. */
  const toPyusd = (ves: number): string | null =>
    rates ? convert(ves, "VES", "PYUSD", rates).toFixed(2) : null;

  const rateLine = () =>
    rates
      ? `${formatSmart(rates.vesPerUsd, "VES")} VES/USD · BCV ${formatAsOf(rates.vesPerUsdAsOf)}`
      : "";

  const noRateNote = () =>
    `No live rate available${ratesError ? ` (${ratesError})` : ""} — nothing was prepared.`;

  // 1. Pago Móvil off-ramp
  const handlePagoMovilSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !amount || !cedula) return;

    if (!rates) {
      push("error", noRateNote());
      return;
    }

    const amountVES = parseFloat(amount);
    if (!Number.isFinite(amountVES) || amountVES <= 0) {
      push("error", "Enter an amount greater than zero.");
      return;
    }

    const equivalentPYUSD = toPyusd(amountVES);
    push(
      "ok",
      `${amountVES.toLocaleString("en-US")} VES → ${equivalentPYUSD} PYUSD at ${rateLine()}.`
    );
    push(
      "warn",
      "Preview only — no PayPal credentials are configured, so no money moved."
    );
    setAmount("");
  };

  // 2. Merchant QR scan
  const handleScanQRDemo = () => {
    setQrSimulated(true);

    const sampleVES = 250;
    const pyusd = toPyusd(sampleVES);

    push(
      pyusd ? "ok" : "error",
      pyusd
        ? `Sample QR of ${sampleVES.toFixed(2)} VES → ${pyusd} PYUSD at ${rateLine()}.`
        : noRateNote()
    );
    push("warn", "Sample data — no camera, no merchant and no payment were involved.");

    // The scan animation is a visual, so it is cleared on a timer; only the
    // label admits what it is. The timer is held so it can be cancelled: under
    // StrictMode the panel mounts twice, and a timer that survives the unmount
    // calls setState on a component that no longer exists — the leak was
    // invisible precisely because the animation still looked right.
    window.clearTimeout(qrTimer.current);
    qrTimer.current = window.setTimeout(() => {
      qrTimer.current = undefined;
      setQrSimulated(false);
    }, 1600);
  };

  useEffect(() => {
    return () => window.clearTimeout(qrTimer.current);
  }, []);

  return (
    <div className="mt-6 space-y-6">
      {/* Rate header: provenance is shown next to the number it belongs to. */}
      <div className="flex justify-between items-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Pago Móvil on/off-ramp</h3>
          <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-slate-500">
            Converts PYUSD in your PayPal balance into Bolívares in a Venezuelan bank account, and
            back the other way. The conversion happens here, at the rate shown.
          </p>
        </div>
        <div className="text-right shrink-0 ml-4">
          {rates ? (
            <>
              <div className="bg-blue-100 text-blue-800 text-xs font-mono font-bold px-3 py-1 rounded-md border border-blue-200">
                {formatSmart(rates.vesPerUsd, "VES")} VES/USD
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                BCV · {formatAsOf(rates.vesPerUsdAsOf)}
              </p>
            </>
          ) : (
            <div className="bg-amber-100 text-amber-700 text-xs font-mono font-bold px-3 py-1 rounded-md border border-amber-200">
              {ratesError ? "Rate unavailable" : "Loading rate…"}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: transfer form */}
        <form onSubmit={handlePagoMovilSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Send Pago Móvil from your PYUSD balance
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pm-bank" className="block text-[11px] font-medium text-slate-600 mb-1">
                Destination Bank
              </label>
              <select
                id="pm-bank"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none"
              >
                <option value="0102">0102 - Banco de Venezuela</option>
                <option value="0108">0108 - Provincial</option>
                <option value="0134">0134 - Banesco</option>
              </select>
            </div>
            <div>
              <label htmlFor="pm-cedula" className="block text-[11px] font-medium text-slate-600 mb-1">
                National ID (Cédula)
              </label>
              <input
                id="pm-cedula"
                type="text"
                placeholder="V-12345678"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                maxLength={12}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pm-phone" className="block text-[11px] font-medium text-slate-600 mb-1">
                Recipient Phone
              </label>
              <input
                id="pm-phone"
                type="tel"
                placeholder="04121234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={15}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none"
              />
            </div>
            <div>
              <label htmlFor="pm-amount" className="block text-[11px] font-medium text-slate-600 mb-1">
                Amount (VES)
              </label>
              <input
                id="pm-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none font-mono"
              />
            </div>
          </div>

          {/* The conversion is the whole point of this rail, so it is shown
              before the button rather than only reported afterwards. */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Recipient gets</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {amount ? Number(amount).toLocaleString("en-US") : "0.00"} VES
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-slate-500">You pay</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {toPyusd(Number(amount) || 0) ?? "—"} PYUSD
              </span>
            </div>
            <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-[11px] text-slate-400">
              {rates
                ? `at ${formatSmart(rates.vesPerUsd, "VES")} VES/USD · BCV ${formatAsOf(rates.vesPerUsdAsOf)}`
                : ratesError
                  ? "No live rate — a transfer cannot be prepared until one is available"
                  : "Waiting for a live rate…"}
            </p>
          </div>

          <button
            type="submit"
            disabled={!rates}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Preview this transfer
          </button>
        </form>

        {/* Right column: merchant QR scanner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between items-center text-center space-y-4 shadow-sm">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Pay by QR
            </h4>
            <p className="text-[11px] text-slate-500">
              Scan a local merchant QR in Venezuela and pay from your digital dollars
            </p>
          </div>

          <div
            className={`w-32 h-32 border-2 border-dashed ${qrSimulated ? "border-blue-500 bg-blue-50/50" : "border-slate-300 bg-slate-50"} rounded-2xl flex items-center justify-center transition-all duration-300 relative overflow-hidden shadow-sm`}
          >
            {qrSimulated ? (
              <div className="w-full h-1 bg-blue-500 absolute top-0 animate-bounce shadow-md shadow-blue-500" />
            ) : null}
            <span className="text-2xl">{qrSimulated ? "📸" : "🔳"}</span>
          </div>

          <button
            onClick={handleScanQRDemo}
            disabled={qrSimulated}
            className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 font-bold text-xs px-6 py-3 rounded-xl transition shadow-sm w-full disabled:opacity-60"
          >
            {qrSimulated ? "Reading QR…" : "Simulate QR scan"}
          </button>
        </div>
      </div>

      {/* Outcome: reported where the action happened, not two pages away. */}
      <div aria-live="polite" className="space-y-2">
        {notes.map((note, index) => (
          <p
            key={`${note.kind}-${index}-${note.text.slice(0, 12)}`}
            className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${NOTE_STYLE[note.kind]}`}
          >
            {note.text}
          </p>
        ))}
      </div>
    </div>
  );
}
