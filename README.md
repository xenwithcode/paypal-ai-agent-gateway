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
| **Talk to it, by voice** | **🎙️ Talk to paypal-ai-agent**, above *Draft order*. You speak; Gemini Live decides what to ask for and returns it as a tool call; the gateway runs it through **the very handler the button uses**, the console prints every line, and the agent answers **out loud**. Its reply is written from the lines those handlers actually logged — so a refused capture is spoken as a refusal, and a balance question reads PayPal live instead of repeating a number it remembers. The text box is still there: voice is an addition to the keyboard, never a replacement for it. |
| **Human-in-the-loop approval** | Every rule lands as `Awaiting approval`. The card opens itself after a draft — nothing is live until you authorize. |
| **Approval card** | Click the product and the order opens as a card: real image, stock, rating, returns and SKU, then **your envelope** — ceiling, condition verdict, the one host it may reach. The catalog is re-read when it opens, so the price being judged is the price now. |
| **Conditional holds** | An order with a condition reserves its ceiling (`Reserved`), settles only through **Capture** while the condition holds, and returns the money through **Release**. The server re-judges the condition on every capture instead of trusting the verdict from draft time. |
| **Charges judged on the server** | `/api/policy/check` compares an attempted charge against the ceiling, the endpoint allow-list, the recipient, the policy's state, its *Valid until* window and its autonomy mode, and reports every violation it finds — not just the first. The same judge stands in front of `POST /api/paypal/orders`, so an order that names the wrong recipient, asks for more than the ceiling, or has run out of days is refused **before PayPal ever sees it**. |
| **Autonomous vs. Copilot** | Routine spends run `Autonomous`. Large or one-off spends run `Copilot` and require a human — enforced on the server: a charge against a `Copilot` order is refused unless the request shows a human behind it, and silence is not read as consent. |
| **An agent that actually acts** | **▶ Run agent** leaves the page running. Every pass re-reads the catalog and settles the `Autonomous` orders whose condition now holds — through the same capture path, so a live one prints its PayPal ids — while `Copilot` orders are refused **by name** and anything past its window never reaches the catalog. Each decision appears in the console in the agent's own colour. |
| **The window is enforced** | *Valid until* is judged, not printed. An order past its date is refused when charged, when captured and when created; a cell that is not a date is refused too, rather than read as "never expires". The same words appear in the grid, on the approval card and in the refusal — one function reads the date for all three. |
| **The ceiling, at a glance** | The ceiling cell draws the current price against the limit — room, close, or unable to fill — beside the number, which still says `· exceeded` in words. A row with no catalog price draws no bar rather than a small one: a missing reading is not a low one. |
| **Money in flight** | One stacked bar per currency — **never added across currencies** — showing the four claims on your money at once: drafted, set aside, moved, given back. The balance in the header is what you *have*; this is what is *committed*, and it is the figure no payment dashboard draws: a normal one shows a balance, this shows money in the state of being decided. `Active` allowances are deliberately absent, because a standing allowance holds nothing — the status exists precisely so that it does not have to reserve money every month. Amounts are the ceiling, because that is exactly what the server reserves, captures and releases. |
| **Over-limit containment** | Attempt one unit over your ceiling, from a host the order does not allow → the server refuses it and reports every violation it found. The alarm carries the reason it gave. |
| **Live FX rates** | BCV official and intervention rates, plus the PYUSD peg — fetched from publishers, never hardcoded, each shown with its source and publication date. |
| **FX shield (VES → PYUSD)** | An incoming VES deposit is converted at the published BCV rate, and the response carries the rate it used. |
| **Conversion shown before it happens** | The transfer form prints *recipient gets* / *you pay* / *the applied rate* above the button, and refuses to submit while no live rate exists. |
| **Live event console** | Every draft, hold transition and charge verdict on this page, streamed. |
| **Purchase history + printable report** | Activity lists every order that settled — date, item, condition, endpoint, amount — beside the charges it refused, which are recorded nowhere else. Sample rows carry a `Sample` chip; **Print / save as PDF** produces the report. |
| **Money that moved, read live** | Activity also asks Transaction Search for the last 30 days and renders the account's own records in AG Grid, with the column groups derived from the response's nesting rather than written by hand — and read in the order a person reads money: *when, how much, what for*, and only then the identifiers. That order is also what is **pinned to the left edge**, so scrolling the other thirty-eight columns cannot take *when* and *how much* away, and the header is capped at three rows however deep PayPal nests (one five-deep branch used to buy a 241px header with two blank rows under every column). **Amounts are read as numbers** — right-aligned, decimals in one column, sorted as money rather than as text — while a column of whole numbers stays text, because a postcode is not money. One search box answers *find the one about X* across every field the response carried: the forty-one per-column funnels it replaced were forty-one answers to a question nobody brings to a ledger. Totals split by direction with fees on their own line, because an amount and the fee taken from it are not the same number. **Clicking any row writes that transaction out top to bottom** — the grid is for scanning many, and the detail is for reading one, and it is brought to the reader rather than left a screen below the row they clicked. *Could not ask*, *asked and it is empty* and *here it is* are three different states — only the last one means you have no transactions. |
| **A balance that keeps up** | The Account Balance is **PayPal's own figure**, read live — not a number this app invents, and not a ledger of its own that could disagree with it. It is read when the page renders, so after a capture, a release or an authorization the screen re-reads it and says so **only when it changed**: money that moved is worth a line, a figure that stayed where it was is not. |
| **The event console, remembered** | The Agentic Event Console is one shared component with one record behind it: the dashboard writes to it and **so does Recurring**, so an order added in one place is readable in the other — and F5 no longer erases it. It is narration, not the ledger: a refusal is still recorded as a record, because a line of prose that scrolls away is not an audit. |
| **Manifests a machine can fetch** | Every stored order is served as a manifest by `GET /api/manifest` — the same document the card in Agentic Commerce shows, built by the same function. `POST /api/manifest` answers the question the other side of a trade asks: *does this payment fit these terms?* It is judged by the same rules a buyer's charge is, plus the one rule only a seller has — nothing below the price is accepted. |
| **Recurring** | Add a service — its type, its URL, the amount and the date it is due — **by typing or by speaking**: the microphone fills the form and stops there, because speech is another way to say something, not a way to have already agreed to it. Either way it is **drafted, never activated**: it lands as *Awaiting approval*, the row says *whose* answer it is waiting for, and the Approve button is on the row itself. The date is stored as the order's own condition, so the agent settles it when the day comes and refuses before it — even for a service no catalog has ever heard of, because a schedule is compared against the clock rather than a price. Standing allowances from Overview appear beside them; removing needs a deliberate second click, and a settled row keeps its receipt rather than a button that would erase it. |
| **Manifest reader** | Agentic Commerce shows the machine-readable record behind each order — ceiling, endpoint, condition, expiry, mode — with absent fields marked absent, and **View as JSON**. |
| **Send money** | Three rails: **USD** first, because that is what PayPal settles in, then the stablecoin, then a Venezuelan bank behind the FX opt-in. Name a recipient and an amount, see *recipient gets* / *you pay* before committing, and the recipient is written into the order **before** anything is authorized. |
| **Grow — `/crowdfunding`** | Capital that grows instead of leaving — built for a two-currency country: real Venezuelan businesses pinned on a map, each with a goal, an **annual return**, a **committee grade (A–C)** and the collateral behind it. Pledge **$20–$1,000** through PayPal's own button — the server judges the band, the goal and the closing date (`judgeInvestment`, every violation and not just the first) — and the money is **reserved, not taken**: captured only when the campaign reaches its goal, released rather than taken when it closes short. |
| **Your position, drawn** | *Invested so far · Paid · Reserved · Earning now · Returned* — with a ring of the three states your money can be in, and a projection that always draws what you put in beside what the offered rate would do to it. The projects table is **AG Grid**; the ring and the curve are **AG Charts** (Community — MIT, no licence key): an instant visual overview of the position, in the same palette the rest of the app speaks. |

---

## The Growth pillar — PayPal AI Crowdfunding

> **Beyond smart money — this is where your capital multiplies.** One screen over from the gateway: the same envelope and the same server judge, pointed the other way — money in, growth out. Finance a real business in Venezuela from **$20 to $1,000** and receive your share in **USD**.

**Why Venezuela is the product, not the backdrop.** A two-currency country: prices are quoted in bolívares and savings live in dollars, so a return offered in USD is not a nicety — it is the currency the saver actually keeps. The screen is built for that reality end to end: the pledge is in USD, the panel prices it in bolívares at the **published BCV rate**, and the share comes back in USD.

**A project must prove itself before it appears.** The map is the list — every project is a pin inside Venezuela — and a payload that cannot be read is refused, never repaired: a goal above zero, raised never past the goal, a closing date (a campaign without one holds money for as long as it likes), coordinates inside the country's bounding box, a payee PayPal can actually reach, and a **collateral** sentence saying what stands behind the money if the business fails. The grade (**A · B · C**) ships with that sentence on purpose: a grade without a reason is a number the reader would have to take on faith. Every seed record carries a `demo` chip, and no photograph of an unaudited business is ever shown.

**The pledge is the same primitive, aimed the other way.** PayPal's own button creates the order; authorizing it reserves. *"The money is reserved, not taken: it is captured only if the campaign reaches its goal."* Two server-side judges keep that promise: `judgeInvestment` at pledge time — band, goal, campaign state, countable number, **every violation and not just the first** — and `settlementRefusal` on every capture: goal met → capture proceeds; campaign still open → the hold *stays reserved*; window closed → **released, not taken**.

**Your position, at a glance.** Afterward, the user can see all their detailed financial data in real time — the amount invested, their gains and projections, and their overall available funds — presented graphically via **AG Grid**: the projects table in the grid itself, and the drawings in its charting engine **AG Charts**, in the same palette *Money in flight* already speaks. *Invested so far · Paid · Reserved · Earning now · Returned · Projects* sit beside the ring that answers *"$50 I pledged — where is it?"* and the curve that projects your own positions at the project's offered rate for 12 or 24 months. The curve always draws **two** lines: the rate, and the floor of what you actually put in. A growth curve is the one number a savings pitch uses to lie; this one shows the deposits beside it.

**Say it out loud.** On this surface the voice agent is offered `investInProject` and **never** `draftOrder` — a screen gets the verbs it can honour. Tell it which projects interest you and how much you want to invest; it checks the pick against the rules and fills the panel — the payment is approved by you, in PayPal.

**Honest about today.** The businesses are seeded records, chipped as such: returns are what a project *offers*, not what anybody has been paid. The project's PayPal account is written into the order's envelope and into the code — the direct-to-business rail exists and is switched off for now, so the pledge runs through the operator's account until it is turned on.

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

- **`lib/gemini.ts`** — calls Gemini with a `responseSchema`, so the model is forced to return valid JSON rather than prose we parse. The system prompt is English to stay aligned with the UI vocabulary. It also owns the authentication decision and hands out a client for any region, because the text model and the live model are not served from the same one.
- **`lib/voice/tools.ts`** — the tools the spoken agent may ask for, plus the validation of what it asks. Pure, import-free, and shared by the server (which declares them), the model (which calls them) and the browser (which checks them before acting).
- **`lib/voice/live.ts`** — the Live API session: audio in, tool calls out, audio back. Server-side only.
- **`lib/grid/setup.ts`** — module registration, the licence key and the grid's theme, in one place because there are two grids and neither imports the other. Which *modules* get registered is decided by `lib/grid/licence.ts`, which reads a key before anyone hands it to a manager — AG Grid and AG Studio keep separate licence stores, and a Studio key given to the grid prints "Invalid License Key" although the key is valid.
- **`lib/policy.ts`** — one source of truth for status and mode strings shared by server and grid, so a cell can never drift from what the renderer compares against.
- **`lib/fx/rates.ts`** — pure conversion math through USD; no fetching, shared by server and browser.
- **`lib/fx/providers.ts`** — dolarvzla (BCV + intervention) and CoinGecko. Both verified reachable and keyless. **If the BCV feed fails it raises rather than guessing a rate.**
- **`app/api/fx/route.ts`** — proxies the feeds with a 60s cache so CoinGecko's free quota is spent once per window instead of once per visitor.
- **`lib/paypal.ts`** — one shared `paypalClient` plus `getPYUSDBalance()` through Transaction Search v1. Server-only; no client module imports it.
- **`lib/shields/`** — `InflationShield` (conversion), `PagoMovilEngine` (transfer + QR parsing).
- **`lib/contingency.ts`** — refund-on-cancellation and the spend-policy enforcement check.

---

## Quick start

> **Just want to see it?** It is already running: **<https://paypal-ai-agent-906128164063.us-east1.run.app>**
> — deployed on Cloud Run (us-east1), scale-to-zero, real PayPal sandbox orders. Everything
> below is for running it yourself.
>
> **The first visit after a quiet spell can take a few seconds — that is deliberate.** Cloud Run
> runs this app *scale-to-zero*: the container stops when nobody is looking, which is the
> architecture Google itself recommends for exactly this, so a demo nobody is watching costs
> nothing at all. The trade is the **~5–15 s cold start** that the first page pays after such a
> spell; every load after that is instant. Keeping an instance permanently warm instead would
> bill **≈ $2.29/day** (1 vCPU + 1 GiB at $0.000024 per vCPU-second and $0.0000025 per
> GiB-second) to save one visitor five seconds — not a trade to make with a hackathon's budget.

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
# Region and model are NOT independent choices: gemini-3.8-flash 404s from
# us-central1 and answers from `global`. The text model is gemini-3.1-flash-lite
# — 720 ms to 2.2 s per call where gemini-3.8-flash measured 5.7 s to 142 s on
# the same prompt. Verified against the real SDK, on the deployed project too.
GCP_LOCATION=global

# ── B) Gemini API (Google AI Studio) ────────────────────────────────────
GEMINI_API_KEY=your_gemini_api_key

# ── Optional ────────────────────────────────────────────────────────────
# AG Grid (Enterprise) trial licence — https://www.ag-grid.com/license-pricing/
# WITHOUT it the app registers Community modules on purpose: registering
# Enterprise unlicensed makes AG Grid print an eight-line banner on every page,
# and nothing in the UI is Enterprise-only yet. Enterprise turns on by itself
# when you set this.
NEXT_PUBLIC_AG_GRID_LICENSE_KEY=
# AG Studio trial licence — a DIFFERENT product with a different licence store.
# A Studio key given to the grid prints "Invalid License Key" although it is
# valid. It is read but not wired until a Studio component lands.
NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY=

# The voice agent's Live endpoint — deliberately NOT GCP_LOCATION, because
# gemini-3.8-live answers from us-central1 and 404s from `global`.
GEMINI_LIVE_LOCATION=us-central1
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_LIVE_VOICE=Aoede
```

```bash
npm run dev
```

Open the URL the dev server prints — **http://localhost:3000** unless that
port is taken, in which case it picks the next free one and says so.

**For the judge in a hurry** — three clicks explain the whole product:

1. **`/overview`** — the strip at the top *is* the thesis: the agent
   prepares, you approve, our server pays. Then press the microphone and say
   what may be bought.
2. **Click any amount in *Money in flight*** — the chart drills into the
   order behind the number.
3. **`/crowdfunding`** — the one screen where money grows rather than leaves:
   pick a project on the map, pledge with PayPal, then release the hold the
   same way every hold in this app is released.

> Prefer `npm run demo` over `npm run dev` when showing it to somebody: the
> production server does not compile a route on its first visit, so the first
> click on every page is instant.

> **No credentials yet?** Everything still runs. The server logs that it is using a demo balance and a deterministic policy fallback, and every screen keeps working. FX rates are live regardless — they need no keys at all.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build — **stop `dev` first** |
| `npm start` | Serve the production build |
| `npm run demo` | Build **and** serve production in one step — what a judge should run: no per-route compile, so the first click is instant (**stop `dev` first**) |
| `npm run lint` / `lint:fix` | ESLint |
| `npm test` | Test suite — transition rules, condition evaluation, the ceiling bands, the window, the charge and hold judgements, history readers, the rate limiter, the column derivations, and the contract the spoken agent works to. Uses Node's built-in runner, so no test dependency. |

> ⚠️ `npm run build` and `npm run dev` both write to `.next/`. The build wipes it, so running them together leaves the dev server serving stale artifacts and throwing `MODULE_NOT_FOUND`.

---

## Walkthrough

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

### Approving as the buyer — the one click only a human makes

Everything above executes through the app. The approval does not, and cannot:
when **Authorize with PayPal AI Agent** hands off, PayPal opens its own
checkout in a new tab and asks who is paying. That is the sandbox asking,
with fake money, and it signs in with the app's test buyer:

| Field | Value |
| --- | --- |
| Account | **John Doe** — personal (buyer) sandbox account |
| Email | `sb-azwqp53197833@personal.example.com` |
| Password | `PDA7371SD` |
| Balance | 5,000 USD of fake money, editable in the sandbox dashboard |
| Card on file | Visa test card already attached to the account |

The three steps, in order: press the button in the app → PayPal opens its
checkout → sign in with the row above and press **Approve**. The session then
stays in the browser until it is closed, so the next approval needs no sign-in.

**Sandbox only.** These credentials work where the app is configured to spend
fake money, and nowhere else: sandbox and live are separate accounts with
separate logins, and the same words on a live login would be real money. They
are published so the walkthrough can be finished without a developer account
of your own. What is *not* published — and never may be — is the client
secret: that one authorises the merchant side, and it lives in `.env.local`
locally and in Secret Manager on Cloud Run.

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
| **UI grid** | AG Grid v36 with the Theming API: custom cell renderer, select editor, and one palette (`lib/grid/setup.ts`) that the table and the page read from together. **Modules are chosen by the licence that is actually configured**: with a Grid/Charts key, Enterprise; with none, Community — because registering Enterprise unlicensed makes AG Grid print an eight-line banner on every page, and nothing in the UI is Enterprise-only yet. An **AG Studio trial key is configured and deliberately not handed to the grid**: the two products keep separate licence stores, and a Studio key fed to `ag-grid-enterprise` prints "Invalid License Key" although the key is valid. Master-Detail and AG Charts become available with a Grid key (`NEXT_PUBLIC_AG_GRID_LICENSE_KEY`), and are covered by the Studio key the moment the grid runs inside a Studio component. |
| **Voice agent** | Gemini **Live API** (`gemini-3.8-live` on Vertex, `us-central1`) — audio in at PCM16/16 kHz, audio out at 24 kHz, with **function calling** as the bridge back into the app. The browser never sees a credential: it posts to `/api/agent/voice`, which opens a short-lived session and returns only the tool calls to run and the audio to play |
| **Crowdfunding** | The pledge rides the **same real sandbox chain** as everything else — `createOrder` (intent `AUTHORIZE`) → `authorizeOrder`, with the campaign's payee on the order — and both judges are real server code: `judgeInvestment` on the way in, `settlementRefusal` on every capture. What is **seeded**: the four businesses (every row carries a `demo` chip, coordinates validated against Venezuela's bounding box, no audit implied) and the dividends, which are computed from the project's offered rate by tested rules rather than paid by anybody. What is **switched off**: the direct-to-business rail — the payee is written into the envelope, but the flag that aims the order at the business rather than the operator's account is `false` today, and the screen does not claim otherwise. |

### Simulated — deterministic, in-process

| Piece | Status |
| --- | --- |
| **Payment execution** | The sandbox chain is wired end to end — `createOrder` (intent `AUTHORIZE`) → `authorizeOrder` → `captureOrder` / `voidPayment` through `@paypal/paypal-server-sdk`. A hold reports `live` only when it actually carries an `authorizationId`; without one it reports `demo` and says no funds moved. The recipient rides the same chain: the payee is written into the order itself, so PayPal directs the funds rather than a later call being able to redirect them. What is still unproven is the payer's own approval in the browser — that click is the one step only the operator can perform. |
| **Enforcement** | The judgement is real and runs on the server — ceiling, endpoint allow-list, recipient, policy state, expiry window and autonomy mode — and it now stands on the money path itself: in front of `POST /api/paypal/orders` before an order exists, on every `capture`, and on every charge sent to `/api/policy/check`. **What is still modelled:** the envelope travels from the browser (the row lives in browser storage until server-side persistence lands), so the server judges the envelope it is given rather than one it owns; and the *isolation* — real kernel isolation needs an OpenShell sandbox, Phase 2. |
| **The autonomous agent** | Real: it runs on a timer, **the server judges every pass**, and a capture goes through the same PayPal path as a click — a live one prints its own `captureId`. What is modelled is the *schedule*: it ticks while this page is open, rather than a worker that wakes on its own. |
| **Transfers and QR** | The conversion maths is real against the live BCV rate. No funds move, and the panel labels itself a preview rather than reporting a settlement. |
| **Recurring / Activity / Agentic Commerce** | All three are built and read real stored records. Activity now reads **Transaction Search live** for what actually moved, beside two local ledgers — what the policy allowed, and what it refused (the one PayPal never sees) — both backed by the durable copy. What is still local: no `createSubscription` yet, and the manifests are rendered from policy rows rather than exchanged with a counterparty. |
| **Voice** | The command, the execution and the reply are real: audio goes to a live model, the tool calls run through the same handlers the buttons call, and the server judge in front of `capture` and `activate` is untouched by any of it. What is not built is a *conversation* — this is push to talk: one utterance, one answer, no streaming microphone and no interrupting the agent mid-sentence. A full-duplex WebSocket would change how the audio travels, not what it is allowed to do. |

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
│   │   ├── hooks/usePaypalBalance.ts # the balance, re-read after money moves
│   │   ├── overview/               # dashboard: intent bar, AG Grid, approval card, console
│   │   ├── recurring/  activity/  commerce/  send/   # allowances · ledger · manifests · transfers
│   │   │   └── VoiceFill.tsx         # optional: fills the form, never submits it
│   │   ├── components/EventConsole.tsx  # one console, one record, two surfaces
│   │   ├── components/VoiceCommand.tsx  # mic → command → execute → speak back
│   │   └── fx/                     # live rates, converter
│   ├── api/agent/route.ts          # intent → policy, metered, validated
│   ├── api/agent/voice/route.ts    # speech → tool calls → spoken reply, same meter
│   ├── api/holds/route.ts          # activate · capture · release · evaluate
│   ├── api/policy/check/route.ts   # ceiling + recipient + window + mode, every violation
│   ├── api/catalog/route.ts        # demo-catalog lookup proxy
│   ├── api/paypal/orders/route.ts  # create · authorize, judged against the envelope first
│   ├── api/paypal/transactions/route.ts # GET — the account's own record, live
│   ├── api/paypal/balance/route.ts  # GET — the figure, re-read after something moved it
│   ├── api/fx/route.ts             # cached live FX proxy
│   ├── api/recurring/parse/route.ts # speech → the four fields, metered like every model call
│   ├── api/store/route.ts          # GET · PUT — the durable copy of the two records
│   ├── api/manifest/route.ts       # GET — every order as a manifest · POST — does this payment fit?
│   ├── layout.tsx  page.tsx  globals.css
├── lib/
│   ├── policy.ts                   # STATUS / MODE + transition, charge, hold and offer judgements, ceiling bands
│   ├── gemini.ts                   # structured-output LLM call + auth for any region
│   ├── voice/{tools,live}.ts       # what the spoken agent may do · the Live session
│   ├── grid/setup.ts               # which modules the licence allows, and the grid's palette
│   ├── grid/licence.ts             # reads a key before it reaches a manager (two stores exist)
│   ├── paypal.ts                   # server-only client, balance, order lifecycle, transactions
│   ├── history.ts                  # the ledger and the policy rows, read and written
│   ├── events.ts                   # what the console said — local, bounded, survives a reload
│   ├── gridColumns.ts              # JSON records → columns for many, labelled lines for one
│   ├── manifests.ts                # one order → the document a counterparty fetches
│   ├── transactionTotals.ts        # what came in, out, and what it cost — split, never summed as one
│   ├── store.ts                    # storage keys, hydration and push to the durable copy
│   ├── storeFile.ts                # server only: where that copy lives and how it is replaced
│   ├── rateLimit.ts                # sliding window in front of the route that spends money
│   ├── contingency.ts              # refunds + enforcement check
│   ├── commerce/catalog.ts         # demo-catalog search + condition evaluation
│   ├── fx/{rates,providers}.ts     # conversion math + live feeds
│   └── shields/                    # InflationShield, PagoMovilEngine
├── data/                           # runtime only, gitignored — the durable copy on disk
├── tests/                          # 353 tests on node:test — transitions, conditions, ceiling bands, window, judgements, ledger, store, rate limit, grid columns, totals, offers, the spoken tool contract, which licence belongs to which manager, and the position card's two ledgers
├── public/architecture/            # Archify diagram + spec, served at /architecture
├── env.example  LICENSE
```

---

## Security notes

- **The agent's authority over money is written down as a policy → [`SECURITY.md`](SECURITY.md).** It states the principle (*the agent requests, the server judges, the human approves*), the three rules a durable consent would have to satisfy, and which levels of autonomy are **built** versus **designed** — including the gaps, so nobody has to discover them.
- **Secrets stay server-side.** `PAYPAL_*` and `GEMINI_API_KEY` carry no `NEXT_PUBLIC_` prefix and are imported only by server modules. `.env.local` is git-ignored and was verified with `git check-ignore` before the first commit. On the **Vertex AI** path there is no key to leak at all — authentication comes from Application Default Credentials read off the machine, and only the project id (not a secret) appears in `.env.local`.
- **What does reach the browser, and how that is checked.** The **client id** ships to the page — PayPal's JS SDK identifies the application with it, the way a Stripe publishable key does; it is not a credential. Everything else stays server-side, and `npm run audit:html` proves it against the built app rather than against a promise: it serves a production build on a free port and fails if any secret from `.env.local` (or any `Bearer` / `A21…` / `AIza…` pattern) appears in a response, or if a page does not answer 200 — because an error page contains no secrets and would otherwise read as clean.
- **Input validation.** `/api/agent` rejects malformed JSON, non-string or empty intents, and anything over 500 characters before a model call can happen.
- **No internal error leakage.** Production returns a generic message; detail goes to the server log only.
- **A rate is never guessed.** If the BCV feed is unreachable the FX path raises instead of converting at a plausible-but-wrong number.
- **Rate limiting on `/api/agent`.** A sliding window in memory — 20 requests a minute per caller, checked **before the body is read**. It guards two spends: the model call and the PayPal balance read behind it. It is a loop detector, not a meter: a person drafting orders never gets near it, an effect that never settles goes through it in seconds. Deliberately in-process and dependency-free — a judge who has no service running must still be able to run `npm run dev`, and a setup instruction that fails is worse than a limit that covers one process. Refusals return `429` with `Retry-After`, and the console prints them as `⏳ [LIMIT]` rather than as the agent turning an order down, because nothing was judged.
- **The durable copy is a file, and it is not protected.** `PUT /api/store` writes two arrays to `data/store.json` — atomically, size-capped, and with a payload that is refused rather than defaulted if it arrives without the ledger of refused charges (a missing array sent as `[]` would erase it). It carries **no authentication**: it is localhost, holding what one browser would otherwise hold alone. Anyone who can reach this server can replace those two arrays, and nothing else. Auth is the same roadmap item as below.
- **Not yet implemented:** authentication, CSRF hardening. Required before public hosting — tracked in the roadmap.
- **Standing consent (level 3 in [`SECURITY.md`](SECURITY.md)) — designed, not built:** charge later without a new approval, through PayPal's own Billing Agreement / vaulted token, inside a per-move and per-month ceiling, recorded as `consentId · ceiling · window · revoked` and revocable in one action that says what happens to what is already reserved.

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

Tracked in the maintainer's private session log, and summarised below.

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

- **[AG Grid](https://ag-grid.com)** — the policy control table: editable columns, a ceiling cell that draws the current price against the limit, a *Valid until* cell that says when the window has closed, custom cell renderers for the product and the approval control, select editor for autonomy mode, and the palette — taken from AG Grid's own published design tokens — that the grid and the page share. Enterprise features (Master-Detail, AG Charts) activate with a Grid licence; **AG Studio** (`ag-studio`, `ag-studio-react`) is installed under its own trial licence and is the path to the Studio Agent Framework.

**Supporting**

- Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 3 · lucide-react
- FX data: [dolarvzla](https://dolarvzla.com) (BCV) and [CoinGecko](https://coingecko.com), both keyless
- NVIDIA OpenShell — design reference; integration planned for Phase 2

---

## License

[Apache License 2.0](./LICENSE)
