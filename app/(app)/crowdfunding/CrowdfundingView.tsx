// app/(app)/crowdfunding/CrowdfundingView.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sprout } from "lucide-react";
import EmptyState from "../components/EmptyState";
import VoiceCommand from "../components/VoiceCommand";
import type { VoiceToolCall } from "@/lib/voice/tools";
import ProjectGrid from "./ProjectGrid";
import PortfolioCard from "./PortfolioCard";
import VenezuelaMap from "./VenezuelaMap";
import PayPalAuthorizeButton from "../overview/components/PayPalAuthorizeButton";
import {
  CROWDFUNDING_PREFIX,
  MAX_INVESTMENT_USD,
  MIN_INVESTMENT_USD,
  campaignAction,
  daysLeft,
  judgeInvestment,
  remainingUsd,
  statusOf,
  type Project,
} from "@/lib/crowdfunding";
import { convert, formatAsOf, formatSmart, type FxSnapshot } from "@/lib/fx/rates";
import { MODE, STATUS, type PolicyEnvelope } from "@/lib/policy";
import type { PolicyRow } from "../overview/types";
import {
  appendPolicyRow,
  readPolicyRows,
  recordBlocked,
  updatePolicyRow,
  type ManifestRow,
} from "@/lib/history";
import { ensureHydrated } from "@/lib/store";
import { recordEvent } from "@/lib/events";

/**
 * The showcase: pick a project, see the price in bolívares, and fund it with
 * PayPal for real.
 *
 * Three steps of the design, wired end to end:
 *
 *  1. the catalogue (grid, bars, filters, map),
 *  2. the selection — what $20 costs in bolívares at the official rate,
 *  3. **the payment**, in PayPal's own UI, against an envelope the server
 *     judges first: ceiling, payee, window, autonomy.
 *
 * An investment is a purchase order. The product is a stake, the ceiling is
 * the amount, and the window is the campaign's closing date — so it is stored
 * as a row like every other order, with one extra field saying which project
 * it funds, and it inherits persistence, capture, the console and the judge
 * without any of them being rewritten.
 *
 * What happens to the money follows the same lifecycle the product already
 * has: PayPal **authorizes** it (reserved, not taken), and it is **captured**
 * only when there is something to capture against — a campaign already at its
 * goal. An open campaign leaves the money set aside until the deadline, and
 * past the deadline the window itself refuses: holding money for a project
 * that is never going to start is the one outcome this screen must not
 * produce.
 */

const PILL_AMOUNTS = [20, 50, 100];

/**
 * Whether the order names the business as the account it pays.
 *
 * **Off, for a reason we watched happen twice.** The seed's payees are
 * `…@example.com` — addresses that exist in no sandbox. PayPal *accepts* them
 * when the order is created and *refuses* it at authorize with
 * `TRANSACTION_REFUSED` (HTTP 422), which is exactly what both attempts did.
 * The control is the same flow in Overview: identical sandbox app, identical
 * button, no payee — and it authorized on 05-oct. Everything else in the order
 * is metadata PayPal does not refuse a transaction over.
 *
 * The moment a real sandbox business account exists, this flips to `true` and
 * the payee goes back into the order, the envelope and the copy — the model
 * field never went anywhere, because it is the production design, not the bug.
 */
const DIRECT_TO_BUSINESS = false;

export default function CrowdfundingView({
  projects,
  paypalClientId,
}: {
  projects: Project[];
  /** Read on the server and passed down, the way Overview and Send do it. */
  paypalClientId: string;
}) {
  const [selected, setSelected] = useState<Project | null>(null);
  const [amount, setAmount] = useState("20");
  const [rates, setRates] = useState<FxSnapshot | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [investments, setInvestments] = useState<ManifestRow[] | null>(null);
  const [pledge, setPledge] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [paypalNote, setPaypalNote] = useState<string | null>(null);
  /** The last failure already recorded, so one refusal is not logged three times. */
  const lastFailure = useRef<string | null>(null);
  /** What the button is trying to pay, so a refusal can be recorded with it. */
  const lastPledge = useRef<{ what: string; amount: number } | null>(null);
  /**
   * The order PayPal created for this attempt.
   *
   * Kept from the moment it exists rather than from the moment it fails: when
   * authorization is refused, that id is the only handle on the record PayPal
   * now holds, and without it a refusal can only be argued about from its
   * sentence. With it, the order can be read back — payer, status, payee —
   * which is the difference between a guess and a diagnosis.
   */
  const lastOrder = useRef<string | null>(null);

  /**
   * A payment that did not happen is still an event, and it belongs in the
   * console Overview reads — not only in a message beside the button that
   * caused it. The row is never written, because nothing was reserved, so
   * this line is the only record the product keeps of the attempt, and a
   * product whose claim is auditing its own money cannot let a refusal leave
   * without one.
   */
  const reportFailure = useCallback(
    (rawReason: string) => {
      // The order id travels with the sentence: a refusal without the record it
      // refused can only be argued about from the wording.
      const reason = lastOrder.current
        ? `${rawReason} · order ${lastOrder.current}`
        : rawReason;
      setPaypalNote(reason);
      if (lastFailure.current === reason) return;
      lastFailure.current = reason;
      recordEvent(`❌ [CROWDFUNDING] PayPal refused the pledge: ${reason}`);

      // And into the ledger Activity reads. The section used to claim every
      // refusal never reached PayPal — this one did, and said so, so the
      // record carries its source rather than pretending to be a policy stop.
      recordBlocked({
        what: lastPledge.current?.what ?? "Crowdfunding pledge",
        amount: lastPledge.current?.amount ?? 0,
        currency: "USD",
        endpoint: "",
        reason,
        source: "paypal",
      });
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fx");
        if (!res.ok) throw new Error(res.status === 503 ? "rate feed unavailable" : `HTTP ${res.status}`);
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

  // The portfolio reads the same store Overview writes, after it has been
  // asked for — the rule every stored view here follows.
  const refreshInvestments = useCallback(() => {
    setInvestments(readPolicyRows().filter((row) => Boolean(row.project)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void ensureHydrated().then(() => {
      if (!cancelled) refreshInvestments();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshInvestments]);

  // What the model is told about, in the shape the voice route accepts.
  //
  // `limit` here is **what the campaign is still missing** — the number that
  // decides whether there is room for this investment — and `what` carries the
  // showcase's own words (name, city, offer), so the model names a project the
  // way the grid prints it instead of inventing a slug it cannot spell.
  const voiceRows = useMemo(
    () =>
      projects.map((project, index) => ({
        id: index,
        what: `${project.name} — ${project.city} — ${project.returnPct}% a year`,
        status: statusOf(project),
        limit: remainingUsd(project),
        currency: "USD",
      })),
    [projects]
  );

  /**
   * What the spoken agent may do on this screen.
   *
   * The rule is the same one the buttons follow: the model *requests*, this
   * handler **prepares**, and nothing is charged — the human approves it in
   * PayPal. The amount is judged by `judgeInvestment`, the very function the
   * panel and the server call, so a refusal spoken out loud is the refusal the
   * button would have shown: the voice gets a microphone in front of the same
   * door, not a wider one.
   */
  const executeVoiceTool = useCallback(
    async (calls: VoiceToolCall[]): Promise<string[]> => {
      const captured: string[] = [];
      const say = (line: string) => {
        captured.push(line);
        // The console lives on Overview and this screen has none of its own,
        // so a refusal here is narrated into the shared ledger — otherwise a
        // spoken attempt would leave no record a human could read later.
        recordEvent(line);
      };

      for (const call of calls) {
        switch (call.name) {
          case "investInProject": {
            const index = Math.trunc(Number(call.args.project));
            const amount = Number(call.args.amount);
            const project = projects[index];

            if (!project) {
              say(`❌ [VOICE] There is no project #${index} in the showcase.`);
              break;
            }

            const verdict = judgeInvestment(amount, project);
            if (!verdict.allowed) {
              say(`❌ [VOICE] ${verdict.reason}`);
              break;
            }

            setSelected(project);
            setAmount(String(amount));
            say(
              `🎙️ [VOICE] ${money(amount)} prepared for "${project.name}" — the panel is ready; approving it in PayPal is the part only you can do.`
            );

            // The panel sits below the map: fill the row *and* put it in
            // front of the human, because a panel filled off-screen is a
            // panel nobody approves.
            window.setTimeout(() => {
              document
                .querySelector(`[aria-label="Invest in ${project.name}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 80);
            break;
          }

          case "getBalance": {
            // Read live rather than repeating a figure on screen: a question
            // about money deserves the answer PayPal gives now.
            try {
              const res = await fetch("/api/paypal/balance", { cache: "no-store" });
              const data = (await res.json()) as {
                value?: string;
                currency?: string;
                source?: string;
                reason?: string;
              };
              say(
                res.ok && typeof data.value === "string"
                  ? data.source === "live"
                    ? `💰 Account Balance ${data.value} ${data.currency} — read live for the voice agent.`
                    : `⚠️ [DEMO] Account Balance ${data.value} ${data.currency} — ${
                        data.reason ?? "no live source."
                      }`
                  : "❌ [VOICE] The balance could not be read."
              );
            } catch {
              say("❌ [VOICE] The balance could not be read.");
            }
            break;
          }

          default:
            // A tool that exists, on a screen that cannot run it. Said out
            // loud rather than dropped: the model is only offered what this
            // surface has, and if it asks anyway, silence would read as a
            // command that happened.
            say(
              `❌ [VOICE] "${call.name}" is not something this screen does — here the agent prepares investments.`
            );
        }
      }

      return captured;
    },
    [projects]
  );

  const value = Number(amount);
  // One judge, two callers. The panel and the server read the same rule, so
  // the sentence beside the input cannot be a rule the server does not keep —
  // which is what F3.4 is: the band and the goal, enforced where the money is.
  const investment = selected ? judgeInvestment(value, selected) : null;
  const valid = investment?.allowed === true;
  const inBolivares = rates && valid ? convert(value, "USD", "VES", rates) : null;

  // Kept in a ref rather than passed down: a refusal arrives from a callback
  // that has no idea which project was being paid, and a ledger line without
  // the amount is a line nobody can reconcile.
  useEffect(() => {
    if (selected && valid) {
      lastPledge.current = { what: `Stake in ${selected.name}`, amount: value };
    }
  }, [selected, valid, value]);

  /**
   * The envelope PayPal will be asked to open.
   *
   * `status` has to be the awaiting one: the server refuses to open a hold
   * against anything else. `expires` is the campaign's closing date, so the
   * window rule — written for purchase orders — is what stops a pledge after
   * the campaign is over. `payee` is the business, written here rather than
   * in the request the browser sends, so the destination is fixed before
   * PayPal ever sees it.
   */
  // Memoised, not inline: an object rebuilt every render would be a new
  // dependency for the callback below on every keystroke — which is exactly
  // what eslint flagged, and a warning counts as a failure here.
  const envelope: PolicyEnvelope | null = useMemo(
    () =>
      selected && valid
        ? {
            limit: value,
            currency: "USD",
            allowEndpoint: "",
            payee: DIRECT_TO_BUSINESS ? selected.payeeEmail : "",
            what: `Stake in ${selected.name}`,
            status: STATUS.pending,
            expires: selected.deadline,
            mode: MODE.autonomous,
          }
        : null,
    [selected, valid, value]
  );

  /**
   * What happens after PayPal approves: the row is written as a reservation,
   * and the money is captured only when the campaign already has its goal —
   * which is the condition the capture is *for*.
   */
  const onAuthorized = useCallback(
    async (info: { orderId: string; authorizationId: string }) => {
      if (!selected || !envelope) return;
      setBusy(true);
      setPledge(null);

      const row: PolicyRow = {
        id: Date.now(),
        what: envelope.what,
        merchant: selected.city,
        limit: value,
        currency: "USD",
        condition: "",
        expires: selected.deadline,
        mode: MODE.autonomous,
        status: STATUS.reserved,
        marketPrice: null,
        marketImage: null,
        conditionMet: null,
        conditionDetail: `Pledged through PayPal · order ${info.orderId}`,
        allowEndpoint: "",
        payee: selected.payeeEmail,
        createdAt: new Date().toISOString(),
        authorizationId: info.authorizationId,
        project: selected.id,
      };
      appendPolicyRow(row);
      recordEvent(
        `💰 [CROWDFUNDING] ${money(value)} reserved for "${selected.name}" · PayPal order ${info.orderId} · closes ${selected.deadline}.`
      );

      // A campaign already at its goal: capture now, because the condition
      // this capture waits for is already true. Anything else stays reserved
      // until it closes — the money is set aside, not taken.
      // The same rule the agent's pass applies — one definition, or the
      // button captures what the pass would have released.
      if (campaignAction(selected) === "capture") {
        try {
          const res = await fetch("/api/holds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "capture",
              policy: {
                id: row.id,
                what: row.what,
                merchant: row.merchant,
                condition: row.condition,
                limit: row.limit,
                currency: row.currency,
                status: row.status,
                expires: row.expires,
                mode: row.mode,
                allowEndpoint: row.allowEndpoint,
                payee: row.payee ?? "",
                authorizationId: info.authorizationId,
              },
            }),
          });
          const data = (await res.json()) as { success?: boolean; error?: string; log?: string };
          if (data.success) {
            updatePolicyRow(row.id, {
              status: STATUS.captured,
              capturedAt: new Date().toISOString(),
              conditionDetail: `Paid through PayPal · order ${info.orderId} · capture ${info.authorizationId}`,
            });
            recordEvent(`✅ [CROWDFUNDING] Captured ${money(value)} for "${selected.name}" — the campaign was already funded.`);
            setPledge({
              kind: "ok",
              text: `Paid ${money(value)} to ${selected.name}. The campaign was already funded, so the money moved — it is yours to see in PayPal's sandbox.`,
            });
          } else {
            setPledge({
              kind: "error",
              text: data.error ?? "The capture was refused — the reservation stands and nothing was taken.",
            });
          }
        } catch {
          setPledge({
            kind: "error",
            text: "Could not reach the capture service — the reservation stands and nothing was taken.",
          });
        }
      } else {
        setPledge({
          kind: "ok",
          text: `${money(value)} reserved for ${selected.name}. Nothing is taken yet: it is captured when the campaign reaches its goal, and released if it does not close by ${selected.deadline}.`,
        });
      }

      refreshInvestments();
      setBusy(false);
    },
    [selected, envelope, value, refreshInvestments]
  );

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <EmptyState
            icon={Sprout}
            title="No projects are open yet"
            description="Every business is verified before it appears here: two years of
            invoices, stock you can see, and collateral worth more than what it
            asks for. When the first one is ready, it opens with its goal, its
            return, and exactly what your money is for — and you decide."
            action={{ label: `Invest from $${MIN_INVESTMENT_USD}`, disabled: true }}
            note="Nothing has been funded through this screen yet. The showcase opens
            with the first audited project; until then this section states what
            it will do rather than what it has done."
          />
        </div>
      </div>
    );
  }

  const funded = selected ? statusOf(selected) === "FUNDED" : false;
  const left = selected ? daysLeft(selected.deadline) : 0;

  return (
    <div className="space-y-5">
      <Header />

      {/* The agent, exactly where the copy promises it: he prepares it, you
          approve it. Both sentences are here on purpose — the instruction is
          the product's invitation, the second line is what this build can
          honestly do today. */}
      <section
        aria-label="Talk to the PayPal agent"
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 px-5 py-4"
      >
        <div className="min-w-0 max-w-[70ch]">
          <p className="text-xs leading-relaxed text-slate-600">
            Tell the PayPal agent which projects interest you and how much you want to invest; he
            will handle everything for you.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            He chooses the project, checks it against the rules and fills the panel — the payment
            is approved by you, in PayPal.
          </p>
        </div>
        <VoiceCommand
          rows={voiceRows}
          surface="crowdfunding"
          onExecute={executeVoiceTool}
          onLog={recordEvent}
        />
      </section>

      {/* What *I* hold, above the catalogue of what I could hold. */}
      <PortfolioCard investments={investments} projects={projects} />

      <ProjectGrid projects={projects} onSelected={setSelected} />

      <p className="text-xs leading-relaxed text-slate-400">
        {projects.length} projects · every row marked <span className="font-semibold">demo</span> is
        a sample record: no audit has been performed on it. Returns are what the project offers, not
        what anybody has been paid.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
        <section
          aria-label="Projects on the map"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Where the money goes</h2>
            <span className="text-[11px] text-slate-400">{projects.length} projects · Venezuela</span>
          </div>
          <VenezuelaMap
            projects={projects}
            selectedId={selected ? selected.id : null}
            onSelect={setSelected}
          />
        </section>

        {!selected ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-center text-sm text-slate-500">
            Select a pin on the map — or a row above — to see the business, and what your dollars cost
            in bolívares today at the official BCV rate.
          </div>
        ) : (
          <section
            aria-label={`Invest in ${selected.name}`}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">
                  {funded ? "Goal reached" : "Invest"} in {selected.name}
                </h2>
                <p className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-slate-500">
                  {selected.what} · {selected.city}. Backed by{" "}
                  <span className="font-medium text-slate-700">{selected.collateral.toLowerCase()}</span>
                  , offering <span className="font-medium text-emerald-600">{selected.returnPct}% a year</span>{" "}
                  in dollars.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Grade {selected.risk}
              </span>
            </div>

            {/* The fairness rule, said where the decision is made. */}
            <p
              className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                left <= 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : left <= 7
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              <strong className="font-semibold">
                {left > 0
                  ? `Closes ${selected.deadline} — in ${left} day${left === 1 ? "" : "s"}.`
                  : `Closed on ${selected.deadline}.`}
              </strong>{" "}
              {left > 0
                ? "If the goal is not reached by then, every pledge is released automatically and nobody is charged for a project that never started."
                : "This campaign is over: nothing new can be pledged against it."}
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cf-amount" className="mb-1 block text-[11px] font-medium text-slate-600">
                  Amount (USD)
                </label>
                <input
                  id="cf-amount"
                  type="number"
                  min={MIN_INVESTMENT_USD}
                  max={MAX_INVESTMENT_USD}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-describedby="cf-amount-bounds"
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <div className="mt-2 flex gap-2">
                  {PILL_AMOUNTS.map((pill) => (
                    <button
                      key={pill}
                      type="button"
                      onClick={() => setAmount(String(pill))}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        value === pill
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      +${pill}
                    </button>
                  ))}
                </div>
                <p id="cf-amount-bounds" className="mt-1.5 text-[10px] text-slate-400">
                  Between ${MIN_INVESTMENT_USD} and ${MAX_INVESTMENT_USD.toLocaleString("en-US")} ·{" "}
                  {DIRECT_TO_BUSINESS
                    ? `the money is directed to ${selected.payeeEmail}.`
                    : "paid through this sandbox's own account — each business receives into its own PayPal account in production."}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-500">That is today</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                    {inBolivares !== null ? `${formatSmart(inBolivares, "VES")} VES` : "—"}
                  </span>
                </div>
                <p className="mt-1.5 border-t border-slate-200 pt-1.5 text-[11px] text-slate-400">
                  {investment && !investment.allowed
                    ? investment.reason
                    : !rates
                      ? ratesError
                        ? `No live rate (${ratesError}) — a conversion cannot be shown.`
                        : "Waiting for the official BCV rate…"
                      : `at ${formatSmart(rates.vesPerUsd, "VES")} VES/USD · BCV ${formatAsOf(rates.vesPerUsdAsOf)}`}
                </p>
              </div>
            </div>

            {/* The real thing: PayPal's own button, an order our server creates. */}
            {envelope ? (
              <div className="space-y-2">
                <PayPalAuthorizeButton
                  clientId={paypalClientId}
                  amount={value.toFixed(2)}
                  currency="USD"
                  description={`${envelope.what} — closes ${selected.deadline}`}
                  customId={`${CROWDFUNDING_PREFIX}${selected.id}`}
                  payeeEmail={DIRECT_TO_BUSINESS ? selected.payeeEmail : ""}
                  policy={envelope}
                  disabled={busy}
                  onOrderCreated={(orderId) => {
                    lastOrder.current = orderId;
                    recordEvent(
                      `🧾 [CROWDFUNDING] PayPal order ${orderId} created — ${money(value)} for "${selected.name}", waiting for your approval.`
                    );
                  }}
                  onAuthorized={(info) => void onAuthorized(info)}
                  onUnavailable={reportFailure}
                />
                <p className="text-center text-[11px] leading-relaxed text-slate-400">
                  PayPal asks you to approve. The money is reserved, not taken: it is captured only
                  if the campaign reaches its goal.
                </p>
              </div>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="w-full cursor-not-allowed rounded-xl bg-slate-200 px-4 py-3 text-xs font-bold text-slate-400"
              >
                Fund with PayPal
              </button>
            )}

            {paypalNote && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                PayPal is unavailable here ({paypalNote}) — the order cannot be opened.
              </p>
            )}

            {pledge && (
              <p
                role={pledge.kind === "error" ? "alert" : "status"}
                className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                  pledge.kind === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {pledge.text}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function money(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function Header() {
  return (
    <header className="space-y-1.5">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        PayPal AI Crowdfunding
      </h1>
      <p className="max-w-[70ch] text-sm leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">
          It&apos;s where your PayPal money becomes truly &quot;smart.&quot;
        </span>{" "}
        Finance a real business in Venezuela from ${MIN_INVESTMENT_USD} to $
        {MAX_INVESTMENT_USD.toLocaleString("en-US")} and receive your share in USD. You choose
        where your money goes; and watch it grow month by month. You can do it yourself, or let
        the PayPal-AI-Agent do it for you.
      </p>
    </header>
  );
}
