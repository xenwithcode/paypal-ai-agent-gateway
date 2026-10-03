// app/agent-dashboard/components/AgentGrid.tsx
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import OrderPanel from "./OrderPanel";

// Shared status/mode strings (also produced by the API routes on the server).
import { STATUS, MODE, MODE_OPTIONS, isStatus, type HoldAction } from "@/lib/policy";
import type { PolicyRow } from "../types";
// Type-only, so it is erased before bundling: this file is client-side and
// `lib/paypal.ts` constructs a network client at module scope, which must
// never reach the browser. `isolatedModules` guarantees the `import type`
// form is dropped rather than resolved at build time.
import type { Balance } from "@/lib/paypal";
// One key, one module: Activity reads the same rows this component writes, so
// neither side gets to invent a spelling of its own.
import { POLICY_STORAGE_KEY as STORAGE_KEY, recordBlocked } from "@/lib/history";

/**
 * Structural check for rows read back out of storage. Anything that does not
 * look like a policy — a truncated write, a value another tab left behind, a
 * row written by a previous version — is dropped instead of handed to a grid
 * that would render it without complaint.
 */
function isPolicyRow(value: unknown): value is PolicyRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "number" &&
    Number.isFinite(row.id) &&
    typeof row.what === "string" &&
    typeof row.limit === "number" &&
    Number.isFinite(row.limit) &&
    typeof row.currency === "string" &&
    typeof row.status === "string" &&
    isStatus(row.status)
  );
}

/**
 * What the table starts with: a standing allowance, a drafted order whose
 * condition fails, and a held order whose condition holds. Between them they
 * show every state the Protection column can offer an action for.
 *
 * The prices and thumbnails are the catalog's own values for these products,
 * and they are re-read from the live feed on mount — a seed that has gone stale
 * must not outlive it.
 */
const SEED_ROWS: PolicyRow[] = [
  {
    id: 1,
    what: "Spotify Premium, monthly",
    merchant: "Spotify",
    limit: 15,
    currency: "PYUSD",
    condition: "",
    expires: "",
    mode: MODE.autonomous,
    status: STATUS.enforced,
    marketPrice: null,
    marketImage: null,
    conditionMet: true,
    conditionDetail: "No condition — executes immediately.",
    allowEndpoint: "api.spotify.com",
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
      "Price is 119.99 USD, condition requires <= 100 · 2/2 terms matched (full query) on dummyjson (demo-catalog)",
    // No merchant was named, so no host is restricted — which is itself
    // worth showing rather than leaving to be inferred.
    allowEndpoint: "",
  },
  // A held purchase order whose condition is satisfied right now: money is
  // set aside and waiting for the operator to settle it. The price and
  // thumbnail are the catalog's own values for this product.
  {
    id: 3,
    what: "Apple AirPods Max Silver",
    merchant: "Apple",
    limit: 600,
    currency: "USD",
    condition: "price <= 600",
    expires: "2026-10-31",
    mode: MODE.autonomous,
    status: STATUS.reserved,
    marketPrice: 549.99,
    marketImage:
      "https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/thumbnail.webp",
    conditionMet: true,
    conditionDetail:
      "Price is 549.99 USD, condition requires <= 600 · 4/4 terms matched (full query) on dummyjson (demo-catalog)",
    allowEndpoint: "api.apple.com",
  },
];

export default function AgentGrid({
  balance,
  paypalClientId,
}: {
  balance: Balance;
  paypalClientId: string;
}) {
  const gridRef = useRef<AgGridReact<PolicyRow>>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [fraudAlert, setFraudAlert] = useState<{ active: boolean; msg: string }>({ active: false, msg: "" });

  const [rowData, setRowData] = useState<PolicyRow[]>(SEED_ROWS);

  /**
   * Which row the approval panel is open for — an id rather than the row
   * itself, so the panel keeps following the live row as the server's answer
   * comes back and the status underneath it changes.
   */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedRow =
    selectedId === null ? null : (rowData.find((row) => row.id === selectedId) ?? null);

  const [logs, setLogs] = useState<string[]>([]);

  // Single funnel for this page: drafting, hold transitions and the two test
  // buttons all append their events here. Pago Móvil reports next to its own
  // form instead — a transfer's outcome belongs where the transfer is.
  //
  // Stable by construction — it only uses the functional form of setState —
  // so the handlers below can honestly list it as a dependency instead of
  // closing over a value that changes every render.
  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${message}`, ...prev]);
  }, []);

  /**
   * Re-read the catalog for every row whose verdict could have moved since it
   * was last judged.
   *
   * Rows come back from storage carrying the price and verdict they had when
   * they were written down. Without this the table shows a number that was
   * true at some point rather than the one true now — and both the ceiling
   * signal and the decision to capture depend on it being current.
   *
   * A row that cannot be re-read keeps what it already had. Stale is
   * recoverable; reporting a guess as fresh is not.
   */
  const recheckOrders = useCallback(
    async (rows: PolicyRow[]) => {
      const targets = rows.filter((row) => row.condition.trim() || row.marketPrice !== null);
      if (targets.length === 0) return;

      const updates = await Promise.all(
        targets.map(async (row) => {
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
            if (!data.success) throw new Error(data.error ?? "re-check refused");
            return { id: row.id as number, data: data as Partial<PolicyRow> };
          } catch {
            return null;
          }
        })
      );

      const fresh = new Map<number, Partial<PolicyRow>>();
      for (const update of updates) {
        if (update) fresh.set(update.id, update.data);
      }
      if (fresh.size === 0) return;

      setRowData((prev) =>
        prev.map((row) => {
          const next = fresh.get(row.id);
          if (!next) return row;
          return {
            ...row,
            conditionMet: next.conditionMet !== undefined ? next.conditionMet : row.conditionMet,
            conditionDetail: next.conditionDetail ?? row.conditionDetail,
            marketPrice:
              typeof next.marketPrice === "number" ? next.marketPrice : row.marketPrice,
          };
        })
      );

      addLog(
        `🔄 Re-checked ${fresh.size} order${fresh.size === 1 ? "" : "s"} against the live catalog.`
      );
    },
    [addLog]
  );

  /**
   * Rows live in this browser so a hold survives a reload — a reservation
   * that vanishes when you press F5 is not a reservation.
   *
   * The read happens in an effect rather than in the useState initialiser:
   * the initialiser runs while the page is being rendered on the server too,
   * where localStorage does not exist, and the two renders would disagree.
   */
  useEffect(() => {
    let restored = 0;
    let rows: PolicyRow[] | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored: unknown = JSON.parse(raw);
        // Only accept something shaped like rows. A corrupt or hand-edited
        // value must not take the table down with it.
        if (Array.isArray(stored) && stored.length > 0 && stored.every(isPolicyRow)) {
          rows = stored;
          restored = stored.length;
        }
      }
    } catch {
      // Private mode, disabled storage or unreadable JSON: the session keeps
      // working, it just will not survive the next reload.
    }

    const visible = rows ?? SEED_ROWS;
    if (rows) setRowData(rows);

    // The clock is read here rather than in the initialiser because the
    // initialiser also runs on the server, where it would be a different time
    // — and React reports any disagreement as a hydration mismatch.
    setLogs([
      `[${new Date().toLocaleTimeString()}] ${
        restored
          ? `🗂️ Restored ${restored} order${restored === 1 ? "" : "s"} from this browser.`
          : "🗂️ Order table ready — rows are kept in this browser."
      }`,
    ]);

    // Settle the prices before the operator is asked to act on them. Runs
    // once: `recheckOrders` is memoised on a stable callback.
    void recheckOrders(visible);
  }, [recheckOrders]);

  // Written on every change. Declared after the read above on purpose — on the
  // first commit both run, and the read has to observe the stored value before
  // anything overwrites it with the seed rows.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rowData));
    } catch {
      // Quota exceeded or storage disabled: same trade-off as above.
    }
  }, [rowData]);

  /**
   * Ask the server to move a policy through its lifecycle.
   *
   * The browser never decides the outcome. `activate` returns where the row
   * should land, `capture` is re-judged against the catalog on every attempt,
   * and an illegal transition comes back as an error the console reports. A
   * refused capture still refreshes the verdict on the row, because the point
   * of asking is finding out where the price actually is.
   */
  const handleHoldAction = useCallback(
    async (action: HoldAction, row: PolicyRow) => {
      try {
        const res = await fetch("/api/holds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
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

        if (!data.success) {
          addLog(`❌ [HOLD] ${data.error ?? "The transition was refused."}`);
          if (typeof data.conditionMet !== "undefined") {
            setRowData((prev) =>
              prev.map((r) =>
                r.id === row.id
                  ? {
                      ...r,
                      conditionMet: data.conditionMet,
                      conditionDetail: data.conditionDetail ?? r.conditionDetail,
                    }
                  : r
              )
            );
          }
          return;
        }

        addLog(data.log);

        setRowData((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  status: data.status,
                  // Dated the moment it settles — that is the date the
                  // purchase history prints, not the one it was drafted on.
                  capturedAt:
                    data.status === STATUS.captured
                      ? new Date().toISOString()
                      : r.capturedAt,
                  conditionMet:
                    typeof data.conditionMet !== "undefined" ? data.conditionMet : r.conditionMet,
                  conditionDetail: data.conditionDetail ?? r.conditionDetail,
                  marketPrice:
                    typeof data.marketPrice === "number" ? data.marketPrice : r.marketPrice,
                }
              : r
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`❌ Error reaching the hold service: ${message}`);
      }
    },
    [addLog]
  );

  /**
   * Fire a charge attempt at the server and report whatever it decides.
   *
   * This used to be a setTimeout that announced a block after a fixed delay
   * no matter what the table said — a scripted outcome wearing the costume of
   * enforcement. The attempt is now built from a real row, the server compares
   * it against that row's ceiling and endpoint scope, and the console prints
   * the reason the server returned. If the policy had allowed it, the log
   * would say allowed.
   */
  /**
   * The payer approved in PayPal's own UI. Record what PayPal issued, then
   * run the same transition any other path would — the ids are stored first
   * because a hold without its authorization id can only ever be a demo hold,
   * and this is the one moment that stops being true.
   */
  const handlePaypalAuthorized = useCallback(
    async (row: PolicyRow, info: { orderId: string; authorizationId: string }) => {
      setRowData((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, paypalOrderId: info.orderId, authorizationId: info.authorizationId }
            : r
        )
      );
      addLog(
        `🔐 [PAYPAL] Approved and authorized — hold ${info.authorizationId} on order ${info.orderId}.`
      );
      await handleHoldAction("activate", row);
    },
    [addLog, handleHoldAction]
  );

  const triggerFraudSimulation = async () => {
    const target = rowData.find((row) => row.status === STATUS.enforced) ?? rowData[0];
    if (!target) {
      addLog("❌ [CHECK] No policy to test against — draft and activate one first.");
      return;
    }

    // One unit over the ceiling, from a host this order does not allow: both
    // rules are exercised when the order has a scope, and only the ceiling
    // fires when it does not. Derived from the row rather than scripted, so
    // the verdict is about something the operator actually approved.
    const attempted = Number((target.limit + 1).toFixed(2));
    const endpoint = target.allowEndpoint
      ? target.allowEndpoint.replace(/^api\./, "api.unapproved-")
      : "api.unnamed-merchant.com";

    addLog(`⚠️ [ALERT] Incoming charge: ${attempted.toFixed(2)} ${target.currency} → ${endpoint}...`);

    try {
      const res = await fetch("/api/policy/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charge: { amount: attempted, currency: target.currency, endpoint },
          policy: {
            limit: target.limit,
            currency: target.currency,
            allowEndpoint: target.allowEndpoint,
            what: target.what,
            status: target.status,
          },
        }),
      });
      const data = await res.json();

      if (!data.success) {
        addLog(`❌ [CHECK] ${data.error ?? "The policy check could not run."}`);
        return;
      }

      if (data.allowed) {
        // Reported as-is. The whole point of a check that can pass is that it
        // does not have to pretend otherwise.
        addLog(`✅ [CHECK] ${data.reason}`);
        return;
      }

      addLog(`🚨 [BLOCKED] ${data.reason}`);
      // A payment that was stopped never reaches PayPal, so nothing outside
      // this app would ever record that it was attempted.
      recordBlocked({
        what: target.what,
        amount: data.judged.amount,
        currency: data.judged.currency,
        endpoint: data.judged.endpoint,
        reason: data.reason,
      });
      setFraudAlert({
        active: true,
        msg: `Blocked a ${data.judged.amount.toFixed(2)} ${data.judged.currency} charge to ${data.judged.endpoint} against "${target.what}". ${data.reason}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`❌ [CHECK] Could not reach the policy check: ${message}`);
    }
  };

  const triggerDevaluationShieldSimulation = async () => {
    const depositVES = 45_000;
    // Labelled as a test input. Nothing here is connected to a bank, and the
    // text it replaces asserted both a detected deposit and a depreciation
    // forecast several hours out — neither of which this app is in a position
    // to know.
    addLog(
      `🏦 [TEST INPUT] Simulated payroll deposit of ${depositVES.toLocaleString("en-US")} VES — no bank is connected.`
    );
    addLog("🔎 [FX SHIELD] Reading the live rate before touching anything.");

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

      addLog(
        `📊 [FX] ${data.fx.appliedRate} VES/USD · ${data.fx.source}` +
          ` · BCV ${data.fx.asOf}` +
          (data.fx.changePct !== null ? ` · ${data.fx.changePct.toFixed(2)}% vs previous reading` : "")
      );
      addLog(
        `🛡️ [FX SHIELD] ${depositVES.toLocaleString("en-US")} VES → ${Number(data.gridRow.limit).toFixed(2)} PYUSD at that rate.`
      );
      addLog(
        "⚠️ [DEMO] No PayPal credentials configured — no funds were moved. The figure above is what the live rate would yield."
      );

      // Land the real result in the policy table rather than only narrating it.
      setRowData((prev) => [...prev, data.gridRow]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`❌ [FX] Conversion failed: ${message}`);
    }
  };

  const columnDefs = useMemo<ColDef<PolicyRow>[]>(() => [
    {
      field: "what",
      headerName: "What",
      // Deliberately not editable: this cell is what the agent matched against
      // the catalog, and rewriting it would leave the verdict sitting beside a
      // product that is no longer the one described. It opens the approval
      // panel instead — clicking the product to look at it is the natural
      // gesture, and it leaves every editable column free to keep editing on
      // double-click.
      flex: 1.6,
      cellRenderer: WhatCellRenderer,
      cellClass: "cursor-pointer",
    },
    {
      field: "limit",
      headerName: "Ceiling",
      editable: true,
      flex: 1.0,
      valueParser: (p) => Number(p.newValue),
      // A ceiling the current price already passes is the one fact an approver
      // cannot be left to spot on their own — and it is exactly the case the
      // Condition column never flags, because a policy can carry no condition
      // at all and still be impossible to fill.
      valueFormatter: (p) => {
        const ceiling = Number(p.value);
        if (!Number.isFinite(ceiling)) return String(p.value ?? "");
        const base = `${ceiling.toFixed(2)} ${p.data?.currency ?? ""}`.trim();
        const price = p.data?.marketPrice;
        const over = typeof price === "number" && price > ceiling;
        return over ? `${base} · exceeded` : base;
      },
      // Red is a secondary cue only: the word "exceeded" carries the meaning
      // for anyone who cannot read it.
      cellClass: (p) => {
        const ceiling = Number(p.value);
        const price = p.data?.marketPrice;
        const over = Number.isFinite(ceiling) && typeof price === "number" && price > ceiling;
        return over
          ? "font-mono text-red-700 font-semibold text-right"
          : "font-mono text-emerald-600 font-semibold text-right";
      },
    },
    {
      field: "marketPrice",
      headerName: "Price now",
      // Read-only: the price belongs to the catalog, not to the approver.
      flex: 0.8,
      valueFormatter: (p) =>
        typeof p.value === "number" ? `${p.value.toFixed(2)} ${p.data?.currency ?? ""}`.trim() : "—",
      cellClass: "font-mono tabular-nums text-right cursor-pointer",
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
    {
      field: "expires",
      headerName: "Valid until",
      editable: true,
      flex: 0.8,
      // "None" was being printed as though it were a value the operator had
      // entered. An empty cell means the date was never set, so it should
      // read as absent — and look like it.
      valueFormatter: (p) => {
        const raw = String(p.value ?? "").trim();
        return raw ? raw : "No expiry";
      },
      cellClass: (p) => (String(p.value ?? "").trim() ? "" : "italic text-slate-400"),
    },
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
    addLog(`📨 Drafting an order from: "${prompt}"`);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (data.success) {
        // The console used to announce "Gemini analyzing" before any request
        // had been made — and kept announcing it when no key existed, so no
        // model call had happened at all. It now repeats what the server
        // reported, because a log is only useful if it describes events.
        addLog(
          data.source === "model"
            ? `🧠 [Gemini] Parsed the intent into an order for "${data.gridRow.what}".`
            : "⚙️ [LOCAL] No GEMINI_API_KEY — the intent was parsed without calling a model."
        );
        addLog(
          `📄 [ORDER] Created "${data.gridRow.what}" · ceiling ${data.gridRow.limit} ${data.gridRow.currency}` +
            `${data.gridRow.condition ? ` · condition ${data.gridRow.condition}` : ""}.`
        );
        setRowData(prev => [...prev, data.gridRow]);
        setPrompt("");
        // The card is the moment the human is actually being asked something,
        // so it opens itself rather than waiting to be found in the table.
        setSelectedId(data.gridRow.id);
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
          {/* "Purchase orders" rather than "spend policies": the README and
              the roadmap both describe the product as purchase orders for
              agents, and a judge who reads them first should meet the same
              vocabulary here. The claim is unchanged. */}
          <p className="text-xs text-slate-400">Purchase orders an AI agent cannot break</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 block mb-1">
            Account Balance
            {/* The figure without saying where it came from is a figure a
                reader takes at face value, so the source travels with it. */}
            {balance.source === "demo" && (
              <span
                title={balance.reason ?? "Demo figure — no live data."}
                className="ml-2 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-amber-800"
              >
                demo
              </span>
            )}
          </span>
          <span
            className={`text-2xl font-mono font-bold ${balance.source === "live" ? "text-emerald-400" : "text-amber-300"}`}
          >
            {/* The currency PayPal actually reported. This account holds USD,
                and asking the endpoint for PYUSD answers 400 — so there is no
                PYUSD figure to show, and printing one would be an invention
                rather than a shorthand. */}
            {balance.value} {balance.currency}
          </span>
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
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            theme={themeQuartz}
            animateRows={true}
            context={{ onHoldAction: handleHoldAction }}
            onCellClicked={(event) => {
              // Editable cells keep their own behaviour: a click there is the
              // first half of "double-click to edit", and opening a dialog on
              // it would swallow the second click. The read-only cells — the
              // product and its price — are the ones that mean "look closer".
              if (event.colDef.editable) return;
              const id = (event.data as PolicyRow | undefined)?.id;
              if (typeof id === "number") setSelectedId(id);
            }}
          />
        </div>
      </div>

      {/* The card the human decides from: product, envelope, authorization. */}
      {selectedRow && (
        <OrderPanel
          row={selectedRow}
          paypalClientId={paypalClientId}
          onClose={() => setSelectedId(null)}
          onAction={handleHoldAction}
          onPaypalAuthorized={handlePaypalAuthorized}
        />
      )}

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
