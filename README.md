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
| **Intent → order** | Type *"white sneakers, size 10, by Friday, only if the price drops to 60 USD"* and get a structured order: what, ceiling, **condition**, valid until, mode. |
| **Human-in-the-loop approval** | Every rule lands as `Awaiting approval`. The card opens itself after a draft — nothing is live until you authorize. |
| **Approval card** | Click the product and the order opens as a card: real image, stock, rating, returns and SKU, then **your envelope** — ceiling, condition verdict, the one host it may reach. The catalog is re-read when it opens, so the price being judged is the price now. |
| **Conditional holds** | An order with a condition reserves its ceiling (`Reserved`), settles only through **Capture** while the condition holds, and returns the money through **Release**. The server re-judges the condition on every capture instead of trusting the verdict from draft time. |
| **Charges judged on the server** | `/api/policy/check` compares an attempted charge against the ceiling, the endpoint allow-list, the recipient, the policy's state, its *Valid until* window and its autonomy mode, and reports every violation it finds — not just the first. The same judge stands in front of `POST /api/paypal/orders`, so an order that names the wrong recipient, asks for more than the ceiling, or has run out of days is refused **before PayPal ever sees it**. |
| **Autonomous vs. Copilot** | Routine spends run `Autonomous`. Large or one-off spends run `Copilot` and require a human — enforced on the server: a charge against a `Copilot` order is refused unless the request shows a human behind it, and silence is not read as consent. |
| **An agent that actually acts** | **▶ Run agent** leaves the page running. Every pass re-reads the catalog and settles the `Autonomous` orders whose condition now holds — through the same capture path, so a live one prints its PayPal ids — while `Copilot` orders are refused **by name** and anything past its window never reaches the catalog. Each decision appears in the console in the agent's own colour. |
| **The window is enforced** | *Valid until* is judged, not printed. An order past its date is refused when charged, when captured and when created; a cell that is not a date is refused too, rather than read as "never expires". The same words appear in the grid, on the approval card and in the refusal — one function reads the date for all three. |
| **The ceiling, at a glance** | The ceiling cell draws the current price against the limit — room, close, or unable to fill — beside the number, which still says `· exceeded` in words. A row with no catalog price draws no bar rather than a small one: a missing reading is not a low one. |
| **Over-limit containment** | Attempt one unit over your ceiling, from a host the order does not allow → the server refuses it and reports every violation it found. The alarm carries the reason it gave. |
| **Live FX rates** | BCV official and intervention rates, plus Solana and the PYUSD peg — fetched from publishers, never hardcoded, each shown with its source and publication date. |
| **FX shield (VES → PYUSD)** | An incoming VES deposit is converted at the published BCV rate, and the response carries the rate it used. |
| **Conversion shown before it happens** | The transfer form prints *recipient gets* / *you pay* / *the applied rate* above the button, and refuses to submit while no live rate exists. |
| **Live event console** | Every draft, hold transition and charge verdict on this page, streamed. |
| **Purchase history + printable report** | Activity lists every order that settled — date, item, condition, endpoint, amount — beside the charges it refused, which are recorded nowhere else. Sample rows carry a `Sample` chip; **Print / save as PDF** produces the report. |
| **Standing allowances** | Recurring lists the orders that are `Active` with no condition to wait for — the ones that run until you take them off. Removing one needs a deliberate second click. |
| **Manifest reader** | Agentic Commerce shows the machine-readable record behind each order — ceiling, endpoint, condition, expiry, mode — with absent fields marked absent, and **View as JSON**. |
| **Send money** | Three rails: **USD** first, because that is what PayPal settles in, then the stablecoin, then a Venezuelan bank behind the FX opt-in. Name a recipient and an amount, see *recipient gets* / *you pay* before committing, and the recipient is written into the order **before** anything is authorized. |

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

**Requirements:** Node.js ≥ 20.9 · a [PayPal developer account](https://developer.paypal.com) · Google Gemini credentials — one of:
- **Vertex AI** *(recommended)* — a [Google Cloud](https://console.cloud.google.com) project with the **Vertex AI API** enabled. Billed to that project, so hackathon credits cover it, and no key is stored anywhere.
- **Gemini API** — a [Google AI Studio](https://aistudio.google.com) key. Separate billing from GCP credits.

```bash
git clone <your-repo-url>
cd paypal-ai-agent
npm install
cp env.example .env.local
```

```env
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
# optional — anything other than "Production" runs against the sandbox
PAYPAL_ENVIRONMENT=Sandbox

# Pick ONE below. GCP_PROJECT wins if both are set.

# ── A) Vertex AI ────────────────────────────────────────────────────────
# Auth is Application Default Credentials, so nothing secret lands here.
# Run this once — it opens a browser and writes a credential file:
#   bash <(curl -sSL https://storage.googleapis.com/cloud-samples-data/adc/setup_adc.sh)
GCP_PROJECT=your_gcp_project_id
GCP_LOCATION=us-central1

# ── B) Gemini API (Google AI Studio) ────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key
```

```bash
npm run dev
```

Open the URL the dev server prints — **http://localhost:3000** unless that
port is taken, in which case it picks the next free one and says so.

> **No credentials yet?** Everything still runs. The server logs that it is using a demo balance and a deterministic policy fallback, and every screen keeps working. FX rates are live regardless — they need no keys at all.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build — **stop `dev` first** |
| `npm start` | Serve the production build |
| `npm run lint` / `lint:fix` | ESLint |
| `npm test` | Test suite — transition rules, condition evaluation, the ceiling bands, the window, the charge and hold judgements, history readers. Uses Node's built-in runner, so no test dependency. |

> ⚠️ `npm run build` and `npm run dev` both write to `.next/`. The build wipes it, so running them together leaves the dev server serving stale artifacts and throwing `MODULE_NOT_FOUND`.

---

## Demo walkthrough

1. **Draft an order.** In the intent bar:
   `white sneakers, size 10, by Friday, only if the price drops to 60 USD or less`
   → press **Draft order**. A row appears: *What* `white sneakers, size 10…`,
   *Ceiling* `60 USD`, *Condition* `price <= 60`, *Mode* `Autonomous`, status
   `Awaiting approval`.

   With a Gemini key configured the natural-language deadline (`by Friday`) is
   parsed into *Valid until*. The no-key fallback does not resolve dates, so
   that column reads `No expiry`.

   **The approval card opens by itself.** It shows the product the agent
   found — image, price, stock, rating, returns — and underneath it the
   envelope you are being asked to accept: ceiling, condition and its verdict,
   and the single host this order may reach.

2. **Authorize it.** **Authorize with PayPal AI Agent** → the ceiling is
   reserved and the row becomes `Reserved`. It settles only when the condition
   holds, so **Capture** is offered only while it does — set a ceiling below
   the current price and the card explains why capture is unavailable rather
   than letting you press it.

3. **Trigger the over-limit attempt.** **💥 Simulate Fraud** → a charge one
   unit over your ceiling, from a host the order does not allow, is sent to
   the server and refused. The alarm fires with the reason the server
   returned — no fixed delay, no scripted outcome.

4. **Trigger the FX shield.** **🛡️ Simulate VES Payroll** → a 45,000 VES deposit is converted at the **published BCV rate** (about 51.65 PYUSD at 871 VES/USD, not a round fictional number), and the row shows `Protecting`.

5. **Open FX Shield** in the sidebar → live rate table with sources and dates, plus a converter that reports what the holding would be worth in 30 days.

6. **Capture an order**, then **Open Activity** → it appears in the purchase history
   unmarked, beside the seeded rows that are chipped `Sample`, with the charges it
   refused below. **Print / save as PDF** gives the report — no sidebar, no app
   chrome, just the table and its totals.

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
| **Payment execution** | The sandbox chain is wired end to end — `createOrder` (intent `AUTHORIZE`) → `authorizeOrder` → `captureOrder` / `voidPayment` through `@paypal/paypal-server-sdk`. A hold reports `live` only when it actually carries an `authorizationId`; without one it reports `demo` and says no funds moved. The recipient rides the same chain: the payee is written into the order itself, so PayPal directs the funds rather than a later call being able to redirect them. What is still unproven is the payer's own approval in the browser — that click is the one step only the operator can perform. |
| **Enforcement** | The judgement is real and runs on the server — ceiling, endpoint allow-list, recipient, policy state, expiry window and autonomy mode — and it now stands on the money path itself: in front of `POST /api/paypal/orders` before an order exists, on every `capture`, and on every charge sent to `/api/policy/check`. **What is still modelled:** the envelope travels from the browser (the row lives in browser storage until server-side persistence lands), so the server judges the envelope it is given rather than one it owns; and the *isolation* — real kernel isolation needs an OpenShell sandbox, Phase 2. |
| **The autonomous agent** | Real: it runs on a timer, **the server judges every pass**, and a capture goes through the same PayPal path as a click — a live one prints its own `captureId`. What is modelled is the *schedule*: it ticks while this page is open, rather than a worker that wakes on its own. |
| **Transfers and QR** | The conversion maths is real against the live BCV rate. No funds move, and the panel labels itself a preview rather than reporting a settlement. |
| **Recurring / Activity / Agentic Commerce** | All three are built and read real stored records. What is local is the *source*: no `createSubscription` yet, the ledger is read from this browser's copy — which the server now keeps a durable one of, so it survives a second browser and not just a refresh — rather than from Transaction Search, and the manifests are rendered from policy rows rather than exchanged with a counterparty. |

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
│   │   ├── overview/               # dashboard: intent bar, AG Grid, approval card, console
│   │   ├── recurring/  activity/  commerce/  send/   # allowances · ledger · manifests · transfers
│   │   └── fx/                     # live rates, converter
│   ├── api/agent/route.ts          # intent → policy, metered, validated
│   ├── api/holds/route.ts          # activate · capture · release · evaluate
│   ├── api/policy/check/route.ts   # ceiling + recipient + window + mode, every violation
│   ├── api/catalog/route.ts        # demo-catalog lookup proxy
│   ├── api/paypal/orders/route.ts  # create · authorize, judged against the envelope first
│   ├── api/fx/route.ts             # cached live FX proxy
│   ├── api/store/route.ts          # GET · PUT — the durable copy of the two records
│   ├── layout.tsx  page.tsx  globals.css
├── lib/
│   ├── policy.ts                   # STATUS / MODE + transition, charge and hold judgements, ceiling bands
│   ├── gemini.ts                   # structured-output LLM call
│   ├── paypal.ts                   # server-only client, balance, order lifecycle
│   ├── history.ts                  # the ledger and the policy rows, read and written
│   ├── store.ts                    # storage keys, hydration and push to the durable copy
│   ├── rateLimit.ts                # sliding window in front of the route that spends money
│   ├── contingency.ts              # refunds + enforcement check
│   ├── commerce/catalog.ts         # demo-catalog search + condition evaluation
│   ├── fx/{rates,providers}.ts     # conversion math + live feeds
│   └── shields/                    # InflationShield, PagoMovilEngine
├── data/                           # runtime only, gitignored — the durable copy on disk
├── tests/                          # 100 tests on node:test — transitions, conditions, ceiling bands, window, judgements, ledger, store, rate limit
├── docs/architecture/              # Archify diagram + spec
├── PRODUCT.md  DESIGN.md  TRABAJO-PROXIMA-SESION.md
├── env.example  LICENSE
```

---

## Security notes

- **Secrets stay server-side.** `PAYPAL_*` and `GEMINI_API_KEY` carry no `NEXT_PUBLIC_` prefix and are imported only by server modules. `.env.local` is git-ignored and was verified with `git check-ignore` before the first commit. On the **Vertex AI** path there is no key to leak at all — authentication comes from Application Default Credentials read off the machine, and only the project id (not a secret) appears in `.env.local`.
- **Input validation.** `/api/agent` rejects malformed JSON, non-string or empty intents, and anything over 500 characters before a model call can happen.
- **No internal error leakage.** Production returns a generic message; detail goes to the server log only.
- **A rate is never guessed.** If the BCV feed is unreachable the FX path raises instead of converting at a plausible-but-wrong number.
- **Rate limiting on `/api/agent`.** A sliding window in memory — 20 requests a minute per caller, checked **before the body is read**. It guards two spends: the model call and the PayPal balance read behind it. It is a loop detector, not a meter: a person drafting orders never gets near it, an effect that never settles goes through it in seconds. Deliberately in-process and dependency-free — a judge who has no service running must still be able to run `npm run dev`, and a setup instruction that fails is worse than a limit that covers one process. Refusals return `429` with `Retry-After`, and the console prints them as `⏳ [LIMIT]` rather than as the agent turning an order down, because nothing was judged.
- **The durable copy is a file, and it is not protected.** `PUT /api/store` writes two arrays to `data/store.json` — atomically, size-capped, and with a payload that is refused rather than defaulted if it arrives without the ledger of refused charges (a missing array sent as `[]` would erase it). It carries **no authentication**: it is localhost, holding what one browser would otherwise hold alone. Anyone who can reach this server can replace those two arrays, and nothing else. Auth is the same roadmap item as below.
- **Not yet implemented:** authentication, CSRF hardening. Required before public hosting — tracked in the roadmap.

---

## Roadmap

### Next — the spine of the thesis

1. **The payer's own approval, run once for real.** The chain is built against
   the sandbox — `createOrder` (intent `AUTHORIZE`) → `authorizeOrder` →
   `captureOrder` → `voidPayment` — and a hold reports `live` only when it
   carries an `authorizationId`. The step nobody but the operator can perform
   is clicking PayPal's own button in a browser; until that happens every hold
   reports `demo` and says so. It is also what stands between the Send money
   section and a transfer that has actually been approved.

### Done

- **Conditional Holds** — `Reserved` / `Captured` / `Released`, with the transition rules shared between the server and the button that offers them. Capture is refused whenever the condition is unmet *or unverifiable*, and is re-judged on every attempt rather than trusted from draft time.
- **Server-side enforcement** — `/api/policy/check` compares an attempted charge against the ceiling, the endpoint allow-list and the policy's state; `/api/holds` performs the transitions. The browser reports what it wants; it does not get to declare that its condition is satisfied.
- **Approval card** — the product card ACP and UCP put in front of the human, plus the envelope neither of them carries. Re-read from the catalog each time it opens.
- **Order persistence** — rows survive a reload, are validated on read, and are re-checked against the live catalog on mount.
- **Send money** — the transfer rails moved out of the dashboard into their own section, with USD first because that is what PayPal settles in, the stablecoin rail beside it, and a Venezuelan bank tab behind the FX opt-in.
- **Route A — the recipient** — `createOrder` with `payee.emailAddress`, so the order names the account the money may land on and PayPal directs the funds there. A transfer drafted from `/send` writes its recipient into the envelope *before* PayPal is ever shown.
- **Recipient enforced on the server** — the envelope gained `payee` beside `allowEndpoint`, printed in the order cell, the approval card and the manifest, and judged by the same endpoint that judges the ceiling: an attempt aimed at anyone else is refused, and one that names no destination at all is refused too.
- **Honest console** — the log reports which path produced a policy, labels its simulated inputs as simulated, and prints the server's verdict instead of narrating one.
- **Widened intent schema** — `what`, `merchant`, `condition`, `expires` alongside the ceiling, with grid columns to match. The fallback prefers a currency-adjacent amount so a shoe size cannot become a budget.

### Then

- Activity ledger from Transaction Search v1 (`searchTransactions`) — income, spend, refunds, and blocked attempts, which PayPal never sees and must be logged locally.
- Recurring payments through `createSubscription` / `cancelSubscription`.

### Phase 2

Tracked in [`TRABAJO-PROXIMA-SESION.md`](./TRABAJO-PROXIMA-SESION.md).

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

- **[AG Grid](https://ag-grid.com)** — the policy control table: editable columns, a ceiling cell that draws the current price against the limit, a *Valid until* cell that says when the window has closed, custom cell renderers for the product and the approval control, select editor for autonomy mode, Quartz theme through the Theming API.

**Supporting**

- Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 3 · lucide-react
- FX data: [dolarvzla](https://dolarvzla.com) (BCV) and [CoinGecko](https://coingecko.com), both keyless
- NVIDIA OpenShell — design reference; integration planned for Phase 2

---

## License

[Apache License 2.0](./LICENSE)
