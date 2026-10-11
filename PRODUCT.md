# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary:** a person with a PayPal account who delegates purchases and money tasks to an AI agent — planning a trip, keeping a subscription active, converting a paycheck — and needs to control what that agent is allowed to spend.

They are **global first**. Venezuela is the strongest *initial* case study (severe inflation, USD inconvertibility, Pago Móvil as the dominant local rail), but the product must read correctly to a user in any country. The FX and Pago Móvil tooling is therefore an **opt-in module**, not the spine of the product.

**Secondary (confirmed):** the hackathon judges — PayPal, AG Grid, APIMatic and other sponsor engineers evaluating a submission by the PayPal AI Hackathon 2026 deadline of **12-nov-2026**.

## Product Purpose

Let a person hand real spending authority to an AI agent **without handing over control of their money**.

The product exists because agents can already act, but nothing bounds them. It makes it possible to say, in plain language, "up to 900 PYUSD, this merchant, until this date", have that become a concrete rule, and have it be checked against what the agent actually tries to do.

Secondary purpose: stop saved value from being eroded by a devaluing local currency, by converting into a stable asset on arrival and back out at the moment of real spending.

**Success looks like:** the user states an intent, understands and approves what the agent proposes, and can see — at any moment — what the agent spent, what it was stopped from spending, and what came back.

## Positioning

A **spend governor for AI agents**: a policy that a human approves in a table, and that is validated against every outbound request the agent makes.

The neighbouring product a marketing team could not truthfully copy is *"the AI figures out your intent, writes it as a rule you can read and edit, you approve it once, and the agent runs inside it."* Prompt-level instructions are suggestions; this is a control.

Two supporting mechanisms differentiate it further:

1. **Opt-in FX shield** — an incoming balance in a devaluing currency (VES) is converted to a stable asset (PYUSD) automatically, and back through a local rail (Pago Móvil) at the moment of spending.
2. **UCP-shaped commerce manifest** — the intent becomes a structured, inspectable manifest, so the wiring exists for an agentic economy where buyers and sellers are software.

## Operating Context

- **Current environment:** localhost only. Nothing is deployed, hosted, or public. Everything must be provable locally before any exposure.
- **Build phase:** architecture. Not feature-complete. The user is early and explicitly stated there is a long way to go.
- **Hackathon submission requirements** are a hard, dated constraint: public GitHub repo, license file visible in the About section, complete setup instructions a judge can run unaided or a hosted URL, a written description, a tools list, and a demo video under 3 minutes on YouTube.
- **Demo script today:** state an intent → a policy row appears → human approves it → a fraud attempt over the limit is stopped → a VES payroll deposit is shielded → spend locally via Pago Móvil or QR.

## Capabilities and Constraints

**Confirmed capabilities**

- Intent bar: free text in natural language → structured spend policy (merchant, limit, currency, autonomy mode, expiry).
- Policy table (AG Grid): editable rules, a per-row approval control, and visible per-row state.
- **Human-in-the-loop approval**: nothing becomes active until the user approves it.
- Two autonomy modes: **Autonomous** (small, routine) and **Copilot** (requires a human).
- **Recurring payments**: the user adds a service (Spotify, Netflix, Prime Video) **once**; from then on the agent executes it autonomously until the user removes it. The user can view the list and add or remove items, and both actions need an explicit CTA.
- **FX shield + Pago Móvil**: an opt-in section. Not every user lives in an inflationary economy, so it must be activatable by the user rather than always on. Pago Móvil is Venezuela-specific and may warrant its own page, since it is a complex, near-separate subsystem inside the product.
- Agentic event console: a live log of agent decisions and stopped requests.
- Two simulation triggers: an over-limit charge attempt, and an incoming VES payroll deposit.

**Confirmed constraints**

- Entire UI, code, and documentation are written in **English**. (The maintainer converses in Spanish; that is a collaboration detail, not a product language.)
- Runs without live credentials: unconfigured PayPal or Gemini must degrade gracefully instead of crashing, and must say plainly in the server log when it is simulating.
- `/api/agent` validates input before it can reach the model: malformed JSON, non-string or empty intent, and anything over 500 characters are rejected.
- Secrets stay server-side; no credential-bearing module may be imported by a client component.
- The NVIDIA OpenShell layer is a **design reference and intended security model**, not yet an integration. Nothing in the product may claim kernel-level enforcement that does not exist.

**Open decisions (recorded, not invented)**

- Whether the intent field should surface an explicit *proposal card* with a stated rationale for the user to accept or reject, versus today's implicit proposal-as-table-row.
- Where the agent activity ledger lives (a dedicated page in the navbar is the current proposal) and how blocked attempts — which PayPal never sees — are recorded.
- Information architecture: sidebar-driven navigation with Recurring, FX Shield as an opt-in, Pago Móvil possibly as its own page, plus Activity.
- Whether an in-product explainer is needed for users who do not understand protection/approval terminology.
- Depth of real NVIDIA OpenShell integration versus an honest, lighter-weight server-side enforcement that is genuinely real.

## Brand Commitments

- **The visual system is AG Grid Studio's own published design tokens**, adopted 07-oct-2026 because the maintainer saw that palette on ag-grid.com and chose it over the earlier reference. It is defined once — the ramp lives in `tailwind.config.ts`, and `lib/grid/setup.ts` hands the grid the same hex values — so the table and the page can never disagree about what blue means: neutral greys (`#f9fafb` canvas, `#ffffff` surfaces, `#eaecf0` rules), brand blue `#0042a1` for primary actions and `#0e4491` for chrome, and green/amber/red ramps for verdicts. Flat colour on controls: no gradients, no decorative shadows.
- The earlier reference (`DESIGN.md`, a pastel sticker study the maintainer adapted from an outside style source) was **superseded and removed from the repo on the same date**, because a repo with two binding design systems has none. It is recoverable from git history.
- **No shadows, no gradients, no sharp corners** on interactive elements — these are hard rules of that system, not preferences.
- Product name: **PayPal AI Agent Gateway**.
- Voice: plain and confident. Technical vocabulary must be translated for the user — internal terms like kernel/enforcement are not user-facing language.
- English throughout.

## Evidence on Hand

**Present**

- `tailwind.config.ts` — the palette, in one place, as AG Grid Studio's published tokens.
- `README.md` — English project description including an explicit "what is real and what is simulated" section.
- `ucp-manifest.json` — one example commerce manifest.
- Working Next.js app: dashboard, AG Grid policy table, event console, FX/Pago Móvil panel, `/api/agent`.

**Absent — future work must not fabricate these**

- No Gemini API key. The structured-output call to a real model has **never executed**; only the deterministic fallback has run.
- No real PayPal credentials. Balance reads return a demo value.
- No blocked-attempt ledger, no transaction history, and no persistence — policies vanish on refresh.
- No authentication, rate limiting, or tests.
- Not yet a git repository; no public repository or hosted demo.
- No demo video.

## Product Principles

1. **Approved before active.** Nothing an agent can do becomes live without a human having read and approved it.
2. **Never claim enforcement that does not exist.** Simulated behaviour must be labelled as simulated, in the product and in the docs.
3. **Degrade, do not crash.** Missing credentials or a failed upstream call must leave the product usable and honest about what it is showing.
4. **Core works everywhere; special rails are opt-in.** Spend governance is the product. FX and local payment rails are modules the user switches on.
5. **Translate the machinery.** Show the user the outcome and the reason, never the internal mechanism.

## Accessibility & Inclusion

- No product-specific accessibility standard has been established yet. This is an open requirement, not a confirmed waiver — colour must never be the sole carrier of policy state (rows already pair colour with text and an emoji, which should be preserved and formalised).
