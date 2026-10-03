// app/agent-dashboard/components/AgentGrid.tsx
"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  enableDevValidations,
  type ColDef,
} from "ag-grid-community";

// AG Grid v33+ is modular: modules must be explicitly registered before use.
// AllCommunityModule enables every Community feature (cell editors, selection,
// animations...). It has to run BEFORE any grid is created, and since the
// registration is global we do it once, here, at module scope.
ModuleRegistry.registerModules([AllCommunityModule]);

// ⚠️ AG Grid v33+ styles grids through the Theming API (theme={themeQuartz}),
// which injects its own CSS into the page. Importing the legacy CSS files
// (ag-grid.css / ag-theme-quartz.css) at the same time mixes the two theming
// systems and AG Grid raises error #106. That is why we do NOT import them.
//
// We also enable development validations so the console prints the full error
// text instead of just a code ("error #106"). Guarded by NODE_ENV so it stays
// out of the production bundle.
if (process.env.NODE_ENV !== "production") {
  enableDevValidations();
}

// Child visual components
import ActionBtnRenderer from "./ActionBtnRenderer";
import WhatCellRenderer from "./WhatCellRenderer";
import VEPagoMovilShield from "./VEPagoMovilShield";

// Shared status/mode strings (also produced by the API routes on the server).
import { STATUS, MODE, MODE_OPTIONS } from "@/lib/policy";

interface PolicyRow {
  id: number;
  /** The purchase itself, with the attributes that identify it. */
  what: string;
  /** Named merchant when one was given. Drives endpoint derivation, not shown. */
  merchant: string;
  limit: number;
  currency: string;
  /** Must hold before money moves. Empty = execute immediately. */
  condition: string;
  expires: string;
  mode: string;
  status: string;
  /** Catalog price at draft time, null when nothing matched. */
  marketPrice: number | null;
  /** Catalog thumbnail, so the approver sees what they are approving. */
  marketImage: string | null;
  /** true = condition satisfied, false = violated, null = cannot be judged. */
  conditionMet: boolean | null;
  /** How the verdict was reached, including the catalog it came from. */
  conditionDetail: string;
}

export default function AgentGrid({ initialBalance }: { initialBalance: string }) {
  const gridRef = useRef<AgGridReact<PolicyRow>>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [fraudAlert, setFraudAlert] = useState<{ active: boolean; msg: string }>({ active: false, msg: "" });

  const [rowData, setRowData] = useState<PolicyRow[]>([
    {
      id: 1,
      what: "Spotify Premium, monthly",
      merchant: "Spotify",
      limit: 15,
      currency: "PYUSD",
      condition: "",
      expires: "None",
      mode: MODE.autonomous,
      status: STATUS.enforced,
      marketPrice: null,
      marketImage: null,
      conditionMet: true,
      conditionDetail: "No condition — executes immediately.",
    },
    {
      id: 2,
      what: "Sports Sneakers Off White & Red",
      merchant: "",
      limit: 100,
      currency: "USD",
      condition: "price <= 100",
      expires: "2026-10-31",
      mode: MODE.copilot,
      status: STATUS.pending,
      marketPrice: 119.99,
      marketImage:
        "https://cdn.dummyjson.com/product-images/mens-shoes/sports-sneakers-off-white-&-red/thumbnail.webp",
      conditionMet: false,
      conditionDetail:
        "Price is 119.99 USD, condition requires <= 100 · matched 1/2 terms matched on dummyjson (demo-catalog)",
    },
  ]);

  const [logs, setLogs] = useState<string[]>([
    "[10:28:00] 🛡️ OpenShell governance runtime initialized."
  ]);

  // Single funnel that every panel writes to: Pago Móvil, the QR scanner and
  // the fraud/deflation simulations all append their events to this console.
  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${message}`, ...prev]);
  };

  const onApprovePolicy = useCallback((rowToApprove: PolicyRow) => {
    addLog(`🛡️ [GATEWAY] Enforcing immutable policy for "${rowToApprove.what}". Ceiling: ${rowToApprove.limit} ${rowToApprove.currency}.`);
    setRowData((prevRows) =>
      prevRows.map((row) =>
        row.id === rowToApprove.id ? { ...row, status: STATUS.enforced } : row
      )
    );
    setTimeout(() => {
      addLog(`🟢 [GATEWAY] Sandbox 'sb-${(rowToApprove.merchant || rowToApprove.what).toLowerCase().replace(/\s+/g, "-")}' sealed and active.`);
    }, 600);
  }, []);

  const triggerFraudSimulation = () => {
    addLog("⚠️ [ALERT] Incoming charge attempt detected from an external gateway...");
    addLog("🔍 [UCP] Inbound request: 'LATAM Checkout' attempts to debit 901.00 PYUSD.");
    setTimeout(() => {
      addLog("🚨 [POLICY PANIC] AG Grid limit violation detected (901 > 900).");
      addLog("🔒 [BLOCKED] Network connection severed. Payment credentials isolated in the enclave.");
      setFraudAlert({
        active: true,
        msg: "POLICY PANIC: blocked a 901 PYUSD fraud attempt on LATAM Airlines. The external merchant exceeded your hard limit."
      });
    }, 1200);
  };

  const triggerDevaluationShieldSimulation = async () => {
    const depositVES = 45_000;
    addLog(`🏦 [VES BANK] Incoming deposit detected: +${depositVES.toLocaleString("en-US")} VES (payroll).`);
    addLog("⚠️ [ALERT] Inflation warning active. Bolívar expected to depreciate within the next 3 hours.");

    try {
      // Real call, real BCV rate. This console used to print a hardcoded
      // conversion computed from an outdated rate; every figure below now comes
      // back from the API instead of being narrated.
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "protect my bolivares from devaluation" }),
      });
      const data = await res.json();

      if (!data.success) {
        addLog(`❌ [FX] ${data.error ?? "conversion unavailable"}`);
        return;
      }

      addLog("🧠 [Gemini] Automated action: starting full conversion to preserve value.");
      addLog(
        `📊 [FX] ${data.fx.appliedRate} VES/USD · ${data.fx.source}` +
          ` · BCV ${data.fx.asOf}` +
          (data.fx.changePct !== null ? ` · ${data.fx.changePct.toFixed(2)}%` : "")
      );
      addLog("🛡️ [GATEWAY] Opening the sanctioned exchange ramp.");
      addLog("🟢 [DONE] Funds successfully moved out of the inflationary market.");
      addLog(`💳 [PayPal PYUSD] +${Number(data.gridRow.limit).toFixed(2)} PYUSD credited to your secure vault.`);

      // Land the real result in the policy table rather than only narrating it.
      setRowData((prev) => [...prev, data.gridRow]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`❌ [FX] Conversion failed: ${message}`);
    }
  };

  const columnDefs = useMemo<ColDef<PolicyRow>[]>(() => [
    { field: "what", headerName: "What", editable: true, flex: 1.6, cellRenderer: WhatCellRenderer },
    {
      field: "limit",
      headerName: "Ceiling",
      editable: true,
      flex: 0.8,
      valueParser: (p) => Number(p.newValue),
      cellClass: "font-mono text-emerald-600 font-semibold text-right",
    },
    {
      field: "marketPrice",
      headerName: "Price now",
      // Read-only: the price belongs to the catalog, not to the approver.
      flex: 0.8,
      valueFormatter: (p) =>
        typeof p.value === "number" ? `${p.value.toFixed(2)} ${p.data?.currency ?? ""}`.trim() : "—",
      cellClass: "font-mono tabular-nums text-right",
    },
    {
      field: "condition",
      headerName: "Condition",
      editable: true,
      flex: 1.3,
      // The verdict is spelled out in words; colour is only a secondary cue,
      // never the sole carrier of whether a condition holds.
      valueFormatter: (p) => {
        const raw = p.value ? String(p.value) : "";
        if (!raw) return "— spend now";
        const met = p.data?.conditionMet;
        const verdict = met === true ? "met" : met === false ? "NOT met" : "unverified";
        return `${raw} · ${verdict}`;
      },
      cellClass: (p) => {
        if (!p.value) return "italic text-slate-400";
        if (p.data?.conditionMet === false) return "font-mono text-red-700";
        if (p.data?.conditionMet === true) return "font-mono text-emerald-700";
        return "font-mono text-slate-500";
      },
    },
    { field: "expires", headerName: "Valid until", editable: true, flex: 0.8 },
    {
      field: "mode",
      headerName: "Mode",
      editable: true,
      flex: 0.8,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: MODE_OPTIONS },
    },
    { headerName: "Protection", flex: 1.3, cellRenderer: ActionBtnRenderer },
  ], []);

  const handleGeneratePolicy = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    addLog(`🧠 [Gemini] Analyzing user intent: "${prompt}"`);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`📄 [UCP] Structured manifest created for "${data.gridRow.what}".`);
        setRowData(prev => [...prev, data.gridRow]);
        setPrompt("");
      } else {
        addLog(`❌ [API] ${data.error ?? "The agent rejected the request."}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`❌ Error connecting to the server: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 relative">

      {/* Fraud emergency banner */}
      {fraudAlert.active && (
        <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl border-2 border-red-400 animate-pulse flex flex-col md:flex-row justify-between items-center gap-4 z-50">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚨</span>
            <div>
              <h4 className="font-black text-sm uppercase tracking-wide">Fraud attempt stopped by the gateway</h4>
              <p className="text-xs text-red-100 font-mono">{fraudAlert.msg}</p>
            </div>
          </div>
          <button
            onClick={() => { setFraudAlert({ active: false, msg: "" }); addLog("🛡️ Alarm reset by the human operator."); }}
            className="bg-white text-red-700 font-bold text-xs px-4 py-2 rounded-xl shadow hover:bg-red-50 transition"
          >
            Reset Alarm
          </button>
        </div>
      )}

      {/* Corporate header */}
      <div className="flex justify-between items-center bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div>
          <h1 className="text-xl font-bold">PayPal AI Agent Gateway 🛡️</h1>
          <p className="text-xs text-slate-400">Spend policies an AI agent cannot break</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 block mb-1">Account Balance</span>
          <span className="text-2xl font-mono text-emerald-400 font-bold">{initialBalance} PYUSD</span>
        </div>
      </div>

      {/* Natural-language intent bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <label className="block text-sm font-semibold text-slate-700">
          What should your agent buy? Set a ceiling — and a condition before it may spend.
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. white sneakers, size 10, by Friday, only if the price drops to 60 USD or less"
            maxLength={500}
            className="flex-1 p-4 border border-slate-200 bg-slate-50 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
          />
          <button onClick={handleGeneratePolicy} disabled={loading} className="bg-blue-600 text-white px-6 py-4 rounded-xl font-medium transition hover:bg-blue-700 shadow-sm disabled:opacity-60">
            {loading ? "Drafting..." : "Draft order"}
          </button>
        </div>
      </div>

      {/* AG Grid policy table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        {/* The ag-theme-quartz class is no longer required (the Theming API
            styles the grid through theme={themeQuartz}), but it is harmless and
            AG Grid tolerates it, so we keep it for compatibility. What actually
            broke the grid was importing ag-grid.css. */}
        <div className="ag-theme-quartz" style={{ height: 200, width: "100%" }}>
          <AgGridReact ref={gridRef} rowData={rowData} columnDefs={columnDefs} theme={themeQuartz} animateRows={true} context={{ onApprovePolicy }} />
        </div>
      </div>

      {/* Venezuela Pago Móvil + QR panel */}
      <VEPagoMovilShield addLog={addLog} />

      {/* Kernel event console */}
      <div className="bg-slate-950 text-slate-200 p-4 rounded-2xl border border-slate-800 shadow-inner font-mono text-xs space-y-2">
        <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2 text-slate-400">
          <span>🖥️ Agentic Event Console (UCP & Gateway stream)</span>
          <div className="flex gap-2">
            <button onClick={triggerDevaluationShieldSimulation} className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold transition">
              🛡️ Simulate VES Payroll
            </button>
            <button onClick={triggerFraudSimulation} className="bg-red-950 hover:bg-red-900 border border-red-700 text-red-400 px-2 py-0.5 rounded text-[10px] font-bold transition">
              💥 Simulate Fraud
            </button>
          </div>
        </div>
        <div className="h-32 overflow-y-auto space-y-1 scrollbar-thin">
          {logs.map((log, index) => (
            <div key={index} className={`${log.includes("🚨") || log.includes("⚠️") || log.includes("❌") ? "text-red-400 font-bold" : log.includes("🟢") ? "text-emerald-400" : "text-slate-200"}`}>
              {log}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
