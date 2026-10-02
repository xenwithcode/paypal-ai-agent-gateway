// app/agent-dashboard/components/VEPagoMovilShield.tsx
"use client";

import { useState } from "react";
import { VES_PER_PYUSD, vesToPyusd } from "@/lib/shields/fx";

export default function VEPagoMovilShield({ addLog }: { addLog: (msg: string) => void }) {
  const [phone, setPhone] = useState("");
  const [cedula, setCedula] = useState("");
  const [bank, setBank] = useState("0102");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrSimulated, setQrSimulated] = useState(false);

  // Shared demo FX rate — identical to the one the inflation shield uses.
  const currentRate = VES_PER_PYUSD;

  // 1. Manual Pago Móvil off-ramp (spend / cash out)
  const handlePagoMovilSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !amount || !cedula) return;

    setLoading(true);
    const amountVES = parseFloat(amount);
    const equivalentPYUSD = vesToPyusd(amountVES).toFixed(2);

    addLog(`🏦 [Pago Móvil Out] Request for ${amountVES} VES (${equivalentPYUSD} PYUSD).`);
    addLog(`⚡ [Solana] Opening instant PYUSD micro-settlement channel...`);

    setTimeout(() => {
      addLog(`🔓 [GATEWAY] Cryptographic signature approved transparently.`);
      addLog(`🟢 [OK] Pago Móvil sent. Ref: PM-SOL-482910. Funds converted and settled into the local bank.`);
      setLoading(false);
      setAmount("");
    }, 2000);
  };

  // 2. Merchant QR scanner demo
  const handleScanQRDemo = () => {
    setQrSimulated(true);
    addLog("📸 [Camera] Merchant QR code scanned successfully.");
    addLog("🔍 [UCP Parsing] Extracted data — Tax ID: J-4039281-0 | Bank: 0108 | Amount: 250.00 VES.");

    setTimeout(() => {
      const pyusdCost = vesToPyusd(250).toFixed(2);
      addLog(`🧠 [Agent] Spend evaluation: ${pyusdCost} PYUSD is within your daily budget.`);
      addLog(`🛡️ [Gateway] Processing immediate charge over the Solana network...`);
    }, 1200);

    setTimeout(() => {
      addLog("✅ [UCP OK] Merchant paid instantly. The seller received Bolívares while your balance was debited in PYUSD.");
      setQrSimulated(false);
    }, 3000);
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">

      {/* Module header */}
      <div className="flex justify-between items-start border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            🇻🇪 FX Shield & Pago Móvil On/Off-Ramp
          </h3>
          <p className="text-xs text-slate-500">Two-way settlement bridge in under 2 seconds (PYUSD ⇄ Solana ⇄ VES)</p>
        </div>
        <div className="bg-blue-100 text-blue-800 text-xs font-mono font-bold px-3 py-1 rounded-md border border-blue-200">
          Rate: {currentRate} VES/PYUSD
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Left column: Pago Móvil form */}
        <form onSubmit={handlePagoMovilSubmit} className="space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Send Pago Móvil from your PYUSD balance</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Destination Bank</label>
              <select value={bank} onChange={(e) => setBank(e.target.value)} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none">
                <option value="0102">0102 - Banco de Venezuela</option>
                <option value="0108">0108 - Provincial</option>
                <option value="0134">0134 - Banesco</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">National ID (Cédula)</label>
              <input type="text" placeholder="V-12345678" value={cedula} onChange={(e) => setCedula(e.target.value)} maxLength={12} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Recipient Phone</label>
              <input type="tel" placeholder="04121234567" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={15} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Amount (VES)</label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none font-mono" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-60">
            {loading ? "Settling on Solana..." : "Run Instant Pago Móvil"}
          </button>
        </form>

        {/* Right column: merchant QR scanner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between items-center text-center space-y-4 shadow-inner">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pay by QR (UCP)</h4>
            <p className="text-[11px] text-slate-500">Scan any local merchant QR in Venezuela and pay with your digital dollars</p>
          </div>

          {/* QR visual box */}
          <div className={`w-32 h-32 border-2 border-dashed ${qrSimulated ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 bg-slate-50'} rounded-2xl flex items-center justify-center transition-all duration-300 relative overflow-hidden shadow-sm`}>
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
            {qrSimulated ? "Parsing QR matrix..." : "Simulate QR Scan at a Store"}
          </button>
        </div>

      </div>

    </div>
  );
}
