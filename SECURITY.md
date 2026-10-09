# Security policy — what the AI agent is allowed to do with money

> **Scope.** This is the policy for *the agent* — the part of this app that can
> ask for money to move. It is a product document, not a compliance claim:
> everything marked **built** points at code, everything marked **designed**
> points at a decision that has not been implemented, and nothing here is
> written as though it had.
>
> The general hardening notes (secrets, validation, rate limits, the file
> store) live in the README under *Security notes*. This file is only about
> authority: **who may move money, and how that permission is recorded.**

---

## The principle

> **The agent requests. The server judges. The human approves.**

Speech — or a model's function call — is never authority. A tool call is a
*request* that travels the same road a button press travels, and it is refused
by the same server-side judge before any money can move. There is no path from
"the model said so" to "PayPal did it".

Concretely, in this codebase:

| Layer | What it does | Where |
| --- | --- | --- |
| The model receives **tool declarations**, never credentials | The API key stays on the server; the browser gets back only tool calls and audio | `lib/voice/live.ts`, `app/api/agent/voice` |
| Every call is **validated on its way out of the model** | Unknown tool, missing id, an amount that is not a number → refused with a reason the console prints | `validateVoiceToolCall`, `lib/voice/tools.ts` |
| Every call is **executed by the same handlers the buttons use** | There is no separate, quieter door for voice | `VoiceCommand` → `onExecute` |
| Every movement is **judged server-side** | Ceiling, window, payee, mode, campaign — and now the campaign's band and goal | `lib/policy.ts`, `lib/crowdfunding.ts` |
| **The payer approves in PayPal's own UI** | Our server creates an order; PayPal asks the human. We never hold their login | JS SDK, `app/(app)/overview/components/PayPalAuthorizeButton.tsx` |
| Requests that spend a model call are **rate limited first** | 20/min sliding window, checked before the body is read | `lib/rateLimit.ts` |

---

## The three rules for consent

These are the rules a *durable* permission (the agent acting without asking
each time) must satisfy. **Two of the three are built; the third is the
design for what is not built yet.**

### 1. Never the user's password or login — **built**

- No PayPal password, no user session, no OAuth refresh token is ever entered,
  stored, logged, prompted for or bundled. The payer approves in PayPal's own
  checkout; the app only holds **its own** server credentials
  (`PAYPAL_CLIENT_SECRET`, `GEMINI_API_KEY`), which never carry a
  `NEXT_PUBLIC_` prefix and are imported only by server modules.
- `.env.local` is git-ignored and was verified with `git check-ignore` before
  the first commit. Only `NEXT_PUBLIC_` values reach the browser bundle, and
  today the only ones are the AG Grid licence keys — which their vendor
  documents as shipping in the client bundle by design.
- The model is never told a secret. It receives tool *declarations* and the
  rows of the table; the credentials live behind the route that calls it.

### 2. Every permission is a record — **built for refusals, designed for consent**

- A payment that was stopped is recorded with who stopped it and why, in the
  ledger Activity reads — the one record PayPal never sees. A refusal with no
  record can only be argued about from a sentence.
- **When a durable consent exists it must be recorded the same way:**
  `consentId · ceiling per move · ceiling per month · window · created ·
  revoked`. A permission that leaves no trace is not a permission, it is an
  assumption.
- *Not built yet:* there is no durable consent today. Levels 0–2 below are all
  that exists, and level 2 still rests on an approval a human gave in PayPal.

### 3. Revocable in one click, with ceilings, not signatures — **designed, not built**

- Revocation takes one action and **says what happens to what is already
  reserved** — cancelling a permission must not silently strand or silently
  release money.
- Ceilings are **per movement and per month**: a purchase order approved once,
  not a signature per transaction. Approving forty times a day is what makes a
  consent system unusable, which is the problem this whole product exists to
  solve.
- *Not built yet.* When it is, the mechanism is PayPal's own standing
  consent — a **Billing Agreement / subscription token** or a vaulted payment
  token: approved once by the payer, chargeable only inside the ceilings,
  revocable from this app and from PayPal. **If it cannot be built for real,
  it will not be shown as if it were.**

---

## The four levels of autonomy

| Level | What the agent may do | Status |
| --- | --- | --- |
| **0 — Prepare** | Choose a project or draft an order, judge it, fill the panel, open PayPal | **built** |
| **1 — Copilot** | Act only while a human approves each action | **built** |
| **2 — Autonomous inside the envelope** | Settle on its own when the condition holds — on an order a human already authorized | **built** (Fase 5) |
| **3 — Standing consent** | Charge later without a new approval, inside ceilings and a window, revocable | **designed, not built** |

The gap between 2 and 3 is the whole question: today the agent can act alone
*inside a permission a human already granted*, and the money still only moves
after PayPal's own approval flow.

---

## Known gaps, stated before anyone finds them

1. 🔴 **A PayPal access token appears in the served HTML** on the three pages
   that read the balance. It is a sandbox token that expires in hours, and it
   is not in the page's props — but it is a credential in a response, and this
   README promises otherwise. It is tracked as a red item and has not been
   patched blind: finding the real origin deserves its own pass.
2. **`PUT /api/store` has no authentication.** Anyone who reaches this server
   can replace two arrays and nothing else. Fine on localhost, not on the
   internet — see *Running it safely*.
3. **Rate limiting covers the routes that spend model credits**, not every
   route. Required before public hosting, same roadmap item as auth.
4. **Rows are data, but they are also text sent to a model.** Whatever is in a
   row (`what`, `payee`, amounts) travels to the Gemini API in the prompt. That
   is a data-flow to be aware of, not a vulnerability: no secret is in the
   prompt, and the model cannot act without passing the server's judge.

---

## Running it safely

- **Localhost, not the internet.** Do not expose `npm run dev` through a
  tunnel, a port forward or a shared demo URL. Without auth, `/api/store` is
  world-writable and `/api/paypal/orders` will create real orders against your
  sandbox account.
- **Never paste a key** — not in chat, not in an issue, not in a screenshot,
  not in the demo video, not in a commit. If one ever gets out, **rotate it**;
  deleting the message is not rotating it.
- **Before the repo goes public**, confirm with `git log -p` (or a secret
  scanner) that no key ever entered history, and that `env.example` still holds
  placeholders only.
- **The demo video and screenshots** are published material: check them for
  `.env.local` contents, tokens in URLs, and real email addresses.

---

**Related:** the honesty table in the README (*What is real and what is
simulated*) — where the product says plainly which parts move money and which
do not.
