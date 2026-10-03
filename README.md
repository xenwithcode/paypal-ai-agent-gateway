# PayPal AI Agent Gateway 🛡️

> **Don't build the road. Build the signal that makes it safe.**

The road — machine-to-machine commerce — is already being paved by other people. This project builds the **traffic light** on it.

---

## The gap this fills

Agentic commerce has a protocol stack taking shape. Each layer solves a *capability*:

| Protocol | Solves | Status |
| --- | --- | --- |
| **UCP** | How an agent discovers products and checks out | Google + Shopify + Walmart |
| **AP2** | How the agent proves the human said yes | Cryptographic consent **per purchase** |
| **A2A** | How agents talk to each other | Google |
| **MCP** | How an agent reaches its own tools | Anthropic |
| **Policy** | *How much, to whom, until when — and who stops it* | **Nobody** |
| **Audit** | *What did it do, what was blocked, and why* | **Nobody** |

Take AP2 literally and the result is unusable: a cryptographic signature **for every purchase**. An agent that makes 40 small purchases a day asks you to sign 40 times. That destroys exactly the experience agentic commerce is supposed to deliver.

**So the missing layer is not another rail. It is standing consent with bounds.**

> ### This project is a **Purchase Order system for AI agents**.
>
> In B2B nobody approves every invoice. You approve a PO for a ceiling, and invoices get **captured against it**. That has existed for sixty years in companies — and it does not exist yet for a consumer whose agent is spending money.

Approve **once**: *≤ 60 USD, this week, these merchants.* The agent then produces its per-transaction proof **inside those bounds**, and you only get interrupted when it tries to leave them.

**PayPal's `authorizeOrder` → `captureOrder` → `voidPayment` split is the primitive this needs**: reserve, then take only when a condition holds. Reserving and spending are different acts for a machine, and PayPal already models that.

---

## What it does today

| Capability | What you see |
| --- | --- |
| **Intent → policy** | Type *"fly to Rio with LATAM, at most 900 PYUSD"* and get a structured policy: merchant, limit, currency, autonomy mode, expiry. |
| **Human-in-the-loop approval** | Every rule lands as `Awaiting approval`. Nothing is live until you click **Activate** in the AG Grid cell. |
| **Autonomous vs. Copilot** | Routine spends run `Autonomous`. Large or one-off spends run `Copilot` and require a human. |
| **Over-limit containment** | Charge 901 against a 900 limit → blocked, alarm fires, the event is logged. |
| **Live FX rates** | BCV official and intervention rates, plus Solana and the PYUSD peg — fetched from publishers, never hardcoded, each shown with its source and publication date. |
| **FX shield (VES → PYUSD)** | An incoming VES deposit is converted at the published BCV rate, and the response carries the rate it used. |
| **Conversion shown before it happens** | The transfer form prints *recipient gets* / *you pay* / *the applied rate* above the button, and refuses to submit while no live rate exists. |
| **Live event console** | Every agent decision, policy injection and blocked request, streamed. |

**Sections scaffolded and empty:** Recurring payments · Activity · UCP Commerce.

---

## How it works

```
[ Sidebar + AG Grid control table ]        ← policy, approval, audit
        │  free-text intent
        ▼
[ POST /api/agent ]  validated: JSON, non-string, >500 chars all rejected
        │
        ├── FX intent ──► [ InflationShield ] ──► [ lib/fx ] live BCV + CoinGecko
        │                        │
        ▼                        ▼
[ Gemini structured output ]   policy row + fx provenance
   strict JSON via responseSchema
        │
        ▼
[ Human clicks Activate in AG Grid ]        ← the standing consent
        │
        ▼
[ Enforcement check on every outbound request ]
        │
        ├── within limit ──► allowed
        └── over limit   ──► BLOCKED + logged   🚨
```

**Components**

- **`lib/gemini.ts`** — calls Gemini with a `responseSchema`, so the model is forced to return valid JSON rather than prose we parse. The system prompt is English to stay aligned with the UI vocabulary.
- **`lib/policy.ts`** — one source of truth for status and mode strings shared by server and grid, so a cell can never drift from what the renderer compares against.
- **`lib/fx/rates.ts`** — pure conversion math through USD; no fetching, shared by server and browser.
- **`lib/fx/providers.ts`** — dolarvzla (BCV + intervention) and CoinGecko. Both verified reachable and keyless. **If the BCV feed fails it raises rather than guessing a rate.**
- **`app/api/fx/route.ts`** — proxies the feeds with a 60s cache so CoinGecko's free quota is spent once per window instead of once per visitor.
- **`lib/paypal.ts`** — one shared `paypalClient` plus `getPYUSDBalance()` through Transaction Search v1. Server-only; no client module imports it.
- **`lib/shields/`** — `InflationShield` (conversion), `PagoMovilEngine` (transfer + QR parsing).
- **`lib/contingency.ts`** — refund-on-cancellation and the spend-policy enforcement check.

---

## Quick start

**Requirements:** Node.js ≥ 20.9 · a [PayPal developer account](https://developer.paypal.com) · a [Google AI Studio](https://aistudio.google.com) key

```bash
git clone <your-repo-url>
cd paypal-ai-agent
npm install
cp env.example .env.local
```

```env
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
GEMINI_API_KEY=your_google_ai_studio_key
```

```bash
npm run dev
```

Open **http://localhost:3000**.

> **No credentials yet?** Everything still runs. The server logs that it is using a demo balance and a deterministic policy fallback, and every screen keeps working. FX rates are live regardless — they need no keys at all.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build — **stop `dev` first** |
| `npm start` | Serve the production build |
| `npm run lint` / `lint:fix` | ESLint |

> ⚠️ `npm run build` and `npm run dev` both write to `.next/`. The build wipes it, so running them together leaves the dev server serving stale artifacts and throwing `MODULE_NOT_FOUND`.

---

## Demo walkthrough

1. **Create a policy.** In the intent bar:
   `I want to fly to Rio with LATAM, spending at most 900 PYUSD`
   → a row appears with `LATAM Airlines`, limit `900`, mode `Copilot`, status `Awaiting approval`.

2. **Approve it.** Click **Activate** → status becomes `Active`.

3. **Trigger the over-limit attempt.** **💥 Simulate Fraud** → a 901 charge against your 900 limit is blocked and the alarm fires.

4. **Trigger the FX shield.** **🛡️ Simulate VES Payroll** → a 45,000 VES deposit is converted at the **published BCV rate** (about 51.65 PYUSD at 871 VES/USD, not a round fictional number), and the row shows `Protecting`.

5. **Open FX Shield** in the sidebar → live rate table with sources and dates, plus a converter that reports what the holding would be worth in 30 days.

---

## What is real and what is simulated

Stated plainly, because a judge deserves to know exactly what they are looking at.

### Real — talking to live APIs

| Piece | Implementation |
| --- | --- |
| **FX rates** | dolarvzla BCV + intervention and CoinGecko simple/price — no API key, fetched live, each figure carries its source and publication date |
| **PayPal balance** | Transaction Search API v1 (`searchBalances`) through `@paypal/paypal-server-sdk` |
| **PayPal client** | OAuth 2.0 client-credentials, sandbox by default |
| **LLM inference** | Google Gemini (`@google/genai`) with `responseMimeType: application/json` + `responseSchema` — structured output enforced by the model |
| **UI grid** | AG Grid v36 with the Theming API, custom cell renderer, select editor |

### Simulated — deterministic, in-process

| Piece | Status |
| --- | --- |
| **Payment execution** | No order is created or captured yet. `authorizeOrder` / `captureOrder` / `payee` are the next build step. |
| **Enforcement** | Mirrors OpenShell's *block + isolate* semantics as an in-process check. Real kernel isolation needs an OpenShell sandbox — Phase 2. |
| **Transfers and QR** | End-to-end flow modelled with realistic references. The **conversion maths is real**; the settlement is not. |
| **Policy persistence** | Policies live in memory and vanish on refresh. |
| **Recurring / Activity / UCP Commerce** | Sections exist and are empty. |

> Nothing in this README or the UI claims enforcement or settlement that does not exist.

---

## Project structure

```
paypal-ai-agent/
├── app/
│   ├── (app)/                      # route group — sidebar shell
│   │   ├── layout.tsx              # fixed sidebar, stacked on mobile
│   │   ├── components/Sidebar.tsx  # nav, FX switch, active state
│   │   ├── hooks/useFxShield.ts    # shared opt-in state
│   │   ├── overview/               # dashboard: intent bar, AG Grid, console
│   │   ├── recurring/  activity/  ucp/     # scaffolded, empty states
│   │   └── fx/                     # live rates, converter, Pago Móvil page
│   ├── api/agent/route.ts          # intent → policy, validated
│   ├── api/fx/route.ts             # cached live FX proxy
│   ├── layout.tsx  page.tsx  globals.css
├── lib/
│   ├── policy.ts                   # shared STATUS / MODE constants
│   ├── gemini.ts                   # structured-output LLM call
│   ├── paypal.ts                   # server-only client + balance
│   ├── contingency.ts              # refunds + enforcement check
│   ├── fx/{rates,providers}.ts     # conversion math + live feeds
│   └── shields/                    # InflationShield, PagoMovilEngine
├── docs/architecture/              # Archify diagram + spec
├── PRODUCT.md  DESIGN.md  TRABAJO-PARA-LA-PROXIMA-SESION.md
├── env.example  LICENSE
```

---

## Security notes

- **Secrets stay server-side.** `PAYPAL_*` and `GEMINI_API_KEY` carry no `NEXT_PUBLIC_` prefix and are imported only by server modules. `.env.local` is git-ignored and was verified with `git check-ignore` before the first commit.
- **Input validation.** `/api/agent` rejects malformed JSON, non-string or empty intents, and anything over 500 characters before a model call can happen.
- **No internal error leakage.** Production returns a generic message; detail goes to the server log only.
- **A rate is never guessed.** If the BCV feed is unreachable the FX path raises instead of converting at a plausible-but-wrong number.
- **Not yet implemented:** authentication, rate limiting, CSRF hardening. Required before public hosting — tracked in the roadmap.

---

## Roadmap

### Next — the spine of the thesis

1. **Widen the intent schema.** The current schema captures merchant, limit, currency, mode and expiry only. It cannot express a real purchase order: product, size, colour, deadline, delivery, optimization goal.
2. **Conditional Holds.** `authorizeOrder` when the human approves → capture only when the condition holds → `voidPayment` when it does not. *Reserve ≠ spend* is the Purchase Order behaviour, and every API it needs is already in the SDK.
3. **Route A — PYUSD to a PayPal account.** `createOrder` with `payee.emailAddress`, so money moves to another person with no conversion.

### Then

- Activity ledger from Transaction Search v1 (`searchTransactions`) — income, spend, refunds, and blocked attempts, which PayPal never sees and must be logged locally.
- Recurring payments through `createSubscription` / `cancelSubscription`.
- Policy persistence.

### Phase 2

Tracked in [`TRABAJO-PARA-LA-PROXIMA-SESION.md`](./TRABAJO-PARA-LA-PROXIMA-SESION.md).

- **Cryptographic consent** — produce an AP2-style signature over the approved policy instead of a UI click.
- **Real NVIDIA OpenShell integration** — run the agent in a sandbox, declare the approved endpoints as a network policy, inject credentials only for those.
- **Merchant side** — expose a UCP-shaped manifest a seller agent can verify.
- Auth, rate limiting and CSRF before any public deployment.
- Dispute automation with multimodal evidence.

---

## Tools used

**Required by the challenge**

- **[PayPal Developer Platform](https://developer.paypal.com)** — Server SDK: OAuth client credentials, Transaction Search v1, and the Orders authorize/capture split the conditional-hold design is built on.
- **AI:** Google Gemini (`@google/genai`) with structured outputs.

**Sponsors**

- **[AG Grid](https://ag-grid.com)** — the policy control table: editable columns, custom cell renderer for approval, select editor for autonomy mode, Quartz theme through the Theming API.

**Supporting**

- Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 3 · lucide-react
- FX data: [dolarvzla](https://dolarvzla.com) (BCV) and [CoinGecko](https://coingecko.com), both keyless
- NVIDIA OpenShell — design reference; integration planned for Phase 2

---

## License

[Apache License 2.0](./LICENSE)
