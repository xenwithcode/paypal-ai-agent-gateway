# PayPal AI Agent Gateway 🛡️

**Delegate real spending to an AI agent — without letting it break your rules.**

An AI agent can plan a trip, compare prices and check out on your behalf. The uncomfortable question is: *how much is it allowed to spend, and who stops it when it goes too far?*

PayPal AI Agent Gateway answers that with an **enforceable spend policy**. You describe an intent in plain language, an LLM turns it into a structured policy, and you approve it in an AG Grid control table. The agent then operates strictly inside that envelope.

It also solves a second, very concrete problem: **currency devaluation**. In Venezuela, money left sitting in Bolívares (VES) loses value daily. The app converts an incoming VES payroll deposit into PYUSD — a PayPal stablecoin — in about two seconds, and converts back through a **Pago Móvil** on/off-ramp when you need to spend locally.

> Built for the **[PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/)**.

---

## Table of contents

- [The problem](#the-problem)
- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Demo walkthrough](#demo-walkthrough)
- [What is real and what is simulated](#what-is-real-and-what-is-simulated)
- [Project structure](#project-structure)
- [Security notes](#security-notes)
- [Roadmap — Phase 2](#roadmap--phase-2)
- [Tools used](#tools-used)
- [License](#license)

---

## The problem

**1. AI agents can spend money, but nothing bounds them.**

Agents are getting good at buying things. What they lack is a *spend governor*: a way for a human to say "you may spend up to 900 PYUSD on this trip, only with this merchant, only until this date" — and have that enforced, not merely *requested* in a prompt.

Prompt-level instructions are suggestions. A policy that lives in a table, is approved by a human, and is checked against every outbound request is a control.

**2. Holding local currency in an inflationary economy is a losing strategy.**

A salary that arrives in VES on Friday is worth noticeably less on Monday. The fix is not "remember to convert it" — humans forget. The fix is an agent that converts automatically the moment money arrives, and converts back just in time when you actually spend it.

**3. The next economy is agentic — and payment protocols are not ready for it.**

Merchants and buyers will increasingly be software. The [Universal Commerce Protocol (UCP)](https://ucp.org) model of *manifest → constraints → settlement* is the shape that economy needs. This project implements that manifest concretely, so the wiring already exists when the protocols mature.

---

## What it does

| Capability | What you see |
| --- | --- |
| **Intent → policy** | Type *"I want to fly to Rio with LATAM, spending at most 900 PYUSD"* and get a structured policy row: merchant, limit, currency, autonomy mode, expiry. |
| **Human-in-the-loop approval** | Every rule lands as `Pending Enforcement 🟡`. Nothing is live until you click **Approve Shield 🛡️** in the AG Grid cell. |
| **Autonomous vs. Copilot modes** | Small recurring spends (a Spotify subscription) run `Autonomous`. Large or one-off spends run `Copilot`, which requires a human. |
| **FX shield (VES → PYUSD)** | An incoming 45,000 VES payroll deposit is converted to 1,125 PYUSD automatically, so inflation cannot erode it. |
| **Pago Móvil on/off-ramp** | Send PYUSD → the recipient receives VES via Pago Móvil, or scan a merchant QR and settle instantly. |
| **Fraud containment demo** | A merchant tries to charge 901 PYUSD against a 900 PYUSD limit. The request is blocked and a critical alarm fires. |
| **Live event console** | A streaming log of every agent decision, policy injection and blocked request. |

---

## How it works

```
[ Frontend: Next.js 15 + AG Grid ]
        │  free-text intent
        ▼
[ Next.js API route ] ──► routes intent
        │                        │
        │                        └── FX keywords ──► [ lib/shields/InflationShield ]
        ▼                                              │
[ Gemini structured output ]                          ▼
   returns strict JSON  ──────────►  policy row  [ FX Shield (VES → PYUSD) ]
        │
        ▼
[ Human approves in AG Grid ]
        │
        ▼
[ Enforcement check on every outbound request ]
        │
        ├── within limit ──► sign & allow
        └── over limit   ──► BLOCK + isolate  🚨
```

**Components**

- **`lib/gemini.ts`** — calls Gemini with a `responseSchema`, so the model is forced to return valid JSON matching the policy shape. The system prompt is in English to keep the vocabulary aligned with the UI.
- **`lib/paypal.ts`** — one shared `paypalClient` plus `getPYUSDBalance()` via the PayPal **Transaction Search API** (`/v1/reporting/balances`).
- **`lib/policy.ts`** — single source of truth for the status/mode strings shared by the server and the grid, so a cell can never drift from what the renderer looks for.
- **`lib/shields/`** — isolated modules: `InflationShield` (FX), `PagoMovilEngine` (transfers), `fx` (the shared rate).
- **`lib/contingency.ts`** — refund-on-cancellation logic and the spend-policy enforcement check.

---

## Quick start

**Requirements**

- Node.js ≥ 20.9
- A [PayPal developer account](https://developer.paypal.com) (free sandbox)
- A [Google AI Studio](https://aistudio.google.com) API key with Gemini access

```bash
git clone <your-repo-url>
cd paypal-ai-agent
npm install
cp env.example .env.local
```

Fill in `.env.local`:

```env
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
GEMINI_API_KEY=your_google_ai_studio_key
```

```bash
npm run dev
```

Open **http://localhost:3000**.

> **No credentials yet?** The app still runs. It logs in the server console that it is using a demo balance and a deterministic policy fallback, and every screen keeps working. Add real keys whenever you want live data.

**Available scripts**

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build (stop `dev` first) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint over the whole repo |
| `npm run lint:fix` | ESLint with autofix |

> ⚠️ Do not run `npm run build` while `npm run dev` is running. Both write to `.next/`, and the build wipes it — the dev server then serves stale artifacts and throws `MODULE_NOT_FOUND`.

---

## Demo walkthrough

1. **Create a policy.** In the intent bar type:
   `I want to fly to Rio with LATAM, spending at most 900 PYUSD`
   → a row appears with `LATAM Airlines`, limit `900`, mode `Copilot`, status `Pending Enforcement 🟡`.

2. **Approve it.** Click **Approve Shield 🛡️** in the *Enforcement* column → status flips to `Enforced 🟢`.

3. **Trigger the fraud attempt.** Click **💥 Simulate Fraud** in the console. A merchant tries to charge **901 PYUSD** against your 900 limit → blocked, alarm banner fires.

4. **Trigger the FX shield.** Click **🛡️ Simulate VES Payroll**. A 45,000 VES deposit is converted to **1,125 PYUSD** and the row reports `Protecting Assets 🟢`.

5. **Spend locally.** Use the **Pago Móvil** form or **Simulate QR Scan** to convert PYUSD back into VES.

---

## What is real and what is simulated

We state this plainly because a judge deserves to know exactly what they are looking at.

### Real, talking to live APIs

| Piece | Implementation |
| --- | --- |
| PayPal balance | **Transaction Search API v1** via `@paypal/paypal-server-sdk` (`searchBalances`) |
| PayPal client | OAuth 2.0 client-credentials flow, sandbox by default |
| LLM inference | **Google Gemini** (`@google/genai`) with `responseMimeType: application/json` + `responseSchema` — structured output is enforced by the model, not parsed out of prose |
| UI grid | **AG Grid v36** with the Theming API, custom cell renderer, editable columns, select editor |

### Simulated (deterministic, in-process)

| Piece | Status |
| --- | --- |
| **NVIDIA OpenShell integration** | The enforcement logic mirrors OpenShell's *block + isolate* semantics but runs as an in-process check. **Real kernel-level isolation requires running the agent inside an OpenShell sandbox** — see [Phase 2](#roadmap--phase-2). |
| FX rate | A single shared constant (`lib/shields/fx.ts`). Production needs a live BCV / parallel-market feed. |
| Solana / PYUSD settlement | The settlement path is modelled; no on-chain transaction is broadcast. |
| Pago Móvil / bank rails | End-to-end flow is modelled with realistic references and timings. |
| Escrow release on flight cancellation | In-process simulation. |

> The README and UI deliberately avoid claiming live enforcement that does not exist yet.

---

## Project structure

```
paypal-ai-agent/
├── app/
│   ├── api/agent/route.ts           # Intent → policy endpoint (validated)
│   ├── agent-dashboard/
│   │   ├── page.tsx                 # Server component, reads balance
│   │   └── components/
│   │       ├── AgentGrid.tsx        # AG Grid + intent bar + console
│   │       ├── ActionBtnRenderer.tsx# Approve / Enforced cell renderer
│   │       └── VEPagoMovilShield.tsx# Pago Móvil + QR panel
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── paypal.ts                    # Shared PayPal client + balance
│   ├── gemini.ts                    # Structured-output LLM call
│   ├── policy.ts                    # Shared status/mode constants
│   ├── contingency.ts               # Refunds + enforcement check
│   └── shields/
│       ├── InflationShield.ts       # VES → PYUSD protection
│       ├── PagoMovilEngine.ts       # Transfers + QR parsing
│       └── fx.ts                    # Shared FX rate
├── ucp-manifest.json                # Example UCP commerce manifest
├── env.example
└── LICENSE
```

---

## Security notes

- **Secrets stay server-side.** `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `GEMINI_API_KEY` have no `NEXT_PUBLIC_` prefix and are only imported from server modules. `.env.local` is git-ignored.
- **Input validation.** `/api/agent` rejects malformed JSON, non-string and empty intents, and anything over 500 characters before it can reach the LLM.
- **No internal error leakage.** In production the API returns a generic message; full detail is written to the server log only.
- **No credential exposure to the agent.** The design target — borrowed from OpenShell's model — is that the agent never holds real credentials; they are injected only into requests bound for an approved endpoint.
- **Not yet implemented:** authentication, rate limiting and CSRF hardening. Acceptable for a local demo; required before any public deployment. Tracked in the Phase 2 notes.

---

## Roadmap — Phase 2

Tracked in [`TRABAJO-PARA-LA-PROXIMA-SESION.md`](./TRABAJO-PARA-LA-PROXIMA-SESION.md).

- **Real NVIDIA OpenShell integration** — run the agent inside an OpenShell sandbox, declare the UCP allow-list as an OpenShell network policy, and inject PayPal credentials only for approved endpoints.
- **Live FX feed** — BCV official rate + parallel market, cached with a short TTL.
- **Auth, rate limiting, CSRF** before any public hosting.
- **Real PYUSD on-chain settlement** on Solana.
- **Merchant-side UCP** — emit a manifest a seller agent can verify.
- **Dispute automation** with multimodal evidence.

---

## Tools used

**Required by the challenge**

- **[PayPal Developer Platform](https://developer.paypal.com)** — Server SDK (OAuth client credentials, Transaction Search API v1, balances).
- **AI:** Google Gemini (`@google/genai`) with structured outputs.

**Sponsors**

- **[AG Grid](https://ag-grid.com)** — the policy control table: editable columns, custom cell renderer for approval, select editor for autonomy mode, Quartz theme via the Theming API.

**Supporting**

- Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 3 · NVIDIA OpenShell *(design reference, integration in Phase 2)*

---

## License

[Apache License 2.0](./LICENSE)
