// app/(app)/appendices/final-notes/page.tsx
// Server component: prose and markup only — no state, no effects, no charts.
// Every figure on this page is either stable (a campaign's goal) or labelled
// with the day it was read, because a documentation page that prints a live
// balance is a page that goes quietly wrong the first time money moves.

/**
 * The closing page — and, in practice, the manual.
 *
 * The hackathon asks for work that is "sufficiently documented for the judges
 * to understand and evaluate it". The README is for somebody who clones the
 * repository; this page is for somebody who has three minutes and wants to
 * know what they are looking at. Those are different readers, and the second
 * one is the one who decides.
 *
 * It opens with the thesis in five lines, then does the thing a judge actually
 * needs: it follows one dollar through the whole product — an order that was
 * approved, held, and given back — using a real record from this sandbox, ids
 * and all. Everything else on the page is support for that story: what is
 * real, what is simulated, what was designed and deliberately not built, how
 * to run it, and what each word on the screen means.
 *
 * The rule the other appendices opened with has not changed, and it matters
 * more here than anywhere: **no claim without something behind it**. Where a
 * figure could not be verified, it is dated or labelled rather than rounded
 * into a fact.
 */
export const metadata = {
  title: "Final Notes · PayPal AI Agent Gateway",
  description:
    "How a dollar moves through this product — approved, held, settled or given back — with a real record; what is real, what is simulated, what is not built, and how to run it.",
};

/** The thesis, before any of the machinery. */
const THESIS = [
  "An agent that spends money has no equivalent of a purchase order. It asks for approval per transaction, so a busy agent turns consent into a rubber stamp.",
  "This build converts **per-transaction consent into per-policy consent**: you approve a ceiling once, and the server holds every later attempt to that ceiling.",
  "The envelope is a document, not a dialog: what may be bought, up to how much, to whom, in what window, and under what condition.",
  "The agent never holds a credential. Money moves when a human approves it inside PayPal's own UI, and the server judges every attempt before PayPal sees anything.",
  "Two rails: any currency for anyone, and PayPal AI Crowdfunding — financing a real business in Venezuela from $20, paid in USD.",
];

/**
 * The lifecycle, as the product implements it.
 *
 * Drawn in markup rather than as an image: the arrows are the argument, and
 * text is what a reader can select, search and read aloud.
 */
const STATES = [
  {
    key: "awaiting",
    label: "Awaiting approval",
    tone: "amber",
    what: "Drafted and judged. Nothing is held and nothing can spend.",
  },
  {
    key: "reserved",
    label: "Reserved",
    tone: "blue",
    what: "PayPal set the money aside against this order. It is still in the balance, marked do-not-spend.",
  },
  {
    key: "captured",
    label: "Captured",
    tone: "emerald",
    what: "The condition held and the money moved. Terminal.",
  },
  {
    key: "released",
    label: "Released",
    tone: "slate",
    what: "The hold was cancelled before it settled. The money came back. Terminal.",
  },
] as const;

/** The vocabulary a first-time reader meets, in one sentence each. */
const VOCABULARY = [
  {
    word: "Ceiling",
    says: "The most this order may ever cost. Enforced by the server, not by an attribute on an input somebody can edit.",
  },
  {
    word: "Condition",
    says: "What must be true before money moves, written in words — *price <= 60*, *by Friday*. Empty means it may spend now.",
  },
  {
    word: "Hold",
    says: "The moment PayPal sets money aside. The balance does not drop; the money is simply marked as spoken for.",
  },
  {
    word: "Reserved · Captured · Released",
    says: "The three things that can happen to a hold: set aside, settled, or cancelled. Two of them are endings.",
  },
  {
    word: "Standing commitment",
    says: "An allowance that runs on its own — a subscription. It holds nothing today, so it is shown apart from the ledgers and never added to them.",
  },
  {
    word: "Autonomous · Copilot · Manual",
    says: "How much the agent may settle alone: everything it can prove, nothing without a human, or ask every time.",
  },
  {
    word: "Sample",
    says: "A demonstration row. Nothing was bought and nothing is held; it exists so the screen has something to show before you use it.",
  },
];

export default function FinalNotesAppendix() {
  return (
    <div className="space-y-4 px-6 pb-10 pt-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Final Notes</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-slate-500">
            The manual, in the order a judge reads it: what this is in five lines, then{" "}
            <span className="font-medium text-slate-700">one dollar followed through the whole
            product</span> — approved, held, and given back — using a real record from this
            sandbox. Then what is real, what is simulated, what was designed and deliberately not
            built, how to run it, and what every word on the screen means.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          Written 11 October 2026
        </span>
      </header>

      {/* ── 1 · The thesis ──────────────────────────────────────────── */}
      <Section id="thesis" title="1 · The thesis, in five lines">
        <ol className="mt-3 max-w-[76ch] space-y-2.5 text-sm leading-relaxed text-slate-600">
          {THESIS.map((line, index) => (
            <li key={line} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-mono text-[11px] font-bold text-slate-500">
                {index + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── 2 · How the money moves — the page's centre of gravity ──── */}
      <Section id="money-moves" title="2 · How the money moves — one dollar, start to finish">
        <p className="mt-3 max-w-[76ch] text-sm leading-relaxed text-slate-600">
          Every screen in this product is a view of the same four states. An order is drafted and
          judged; if it is approved, PayPal <span className="font-semibold text-slate-900">holds</span>{" "}
          the money — the balance does not drop, the money is simply marked as spoken for — and from
          there there are exactly two endings.
        </p>

        {/* The flow, drawn in text: the arrows are the argument. */}
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-[640px] items-stretch gap-2">
            <StateBox state={STATES[0]} />
            <Arrow label="approved in PayPal" />
            <StateBox state={STATES[1]} />
            <div className="flex flex-col justify-center gap-2">
              <Arrow label="condition held" horizontal={false} />
              <Arrow label="or it did not" horizontal={false} />
            </div>
            <div className="flex flex-col gap-2">
              <StateBox state={STATES[2]} />
              <StateBox state={STATES[3]} />
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {STATES.map((state) => (
            <div key={state.key} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {state.label}
              </dt>
              <dd className="mt-1 text-xs leading-relaxed text-slate-500">{state.what}</dd>
            </div>
          ))}
        </dl>

        {/* The worked example. Real ids, because a judge who wants to check
            this against the sandbox can — and because a story without an id
            is a story. */}
        <div className="mt-5 rounded-xl border-l-4 border-blue-300 bg-blue-50 p-4 text-sm leading-relaxed text-slate-700">
          <p className="font-semibold text-slate-900">
            A real one, from this sandbox — read this and you have read the product.
          </p>
          <p className="mt-2">
            On <span className="font-semibold text-slate-900">9 October 2026</span>, a{" "}
            <span className="font-semibold text-slate-900">$50 pledge</span> was made to{" "}
            <span className="font-semibold text-slate-900">
              Supermercado Express — new butchery aisle
            </span>{" "}
            (a campaign asking for $50,000; $42,500 raised at the time).
          </p>
          <ol className="mt-2 space-y-1.5">
            <li>
              <span className="font-semibold text-slate-900">1 · Drafted.</span> The request named
              the campaign, so it was judged against the showcase the <em>server</em> holds: $50 is
              inside the $20–$1,000 band, and inside what the campaign was still missing.
            </li>
            <li>
              <span className="font-semibold text-slate-900">2 · Approved in PayPal.</span> The
              human pressed the button inside PayPal — no password, login or key ever reaches this
              app. PayPal issued order{" "}
              <code className="font-mono text-[11px]">3LL9669283585604Y</code> and authorization{" "}
              <code className="font-mono text-[11px]">1WU26270J4621264S</code>, and the $50 became{" "}
              <span className="font-semibold text-blue-700">Reserved</span>: still in the balance,
              marked do-not-spend.
            </li>
            <li>
              <span className="font-semibold text-slate-900">3 · Not settled.</span> A pledge is
              captured <em>only</em> when its campaign reaches its goal — that is the promise the
              card prints above the button, enforced on the server. This campaign was $7,500 short.
            </li>
            <li>
              <span className="font-semibold text-slate-900">4 · Given back.</span> The hold was
              cancelled — Release is one click in the Protection column, and the agent does the
              same when a campaign closes short — and the $50 returned to the balance.
            </li>
          </ol>
          <p className="mt-2">
            On the dashboard today it reads{" "}
            <span className="font-semibold text-slate-900">Returned · $50</span>, it earns{" "}
            <span className="font-semibold text-slate-900">nothing</span> (a refund is not
            performance), and the $50 is spendable again. The money never left the account, and
            every screen said so at every step.
          </p>
        </div>

        <p className="mt-3 max-w-[76ch] text-xs leading-relaxed text-slate-400">
          The campaign names and the ids above are real records of this sandbox account. The money
          is sandbox money: real in every mechanism, worthless in every currency.
        </p>
      </Section>

      {/* ── 3 · The dashboard, read out loud ─────────────────────────── */}
      <Section id="dashboard" title="3 · Your dashboard, read out loud">
        <p className="mt-3 max-w-[76ch] text-sm leading-relaxed text-slate-600">
          <em>How much can you actually spend?</em> — the first card on Overview — is the same
          story told as a position. It shows <span className="font-semibold text-slate-900">two
          ledgers and a promise</span>, and the reason they are separate is the whole discipline of
          this product:
        </p>

        <div className="mt-4 space-y-3">
          <ReadAloud
            block="In PayPal"
            line="What PayPal holds, split into what is free and what your own orders have set aside."
            why="A hold moves nothing, so committed money is still inside the balance. Adding the two would count the same dollar twice."
          />
          <ReadAloud
            block="Invested · PayPal AI Crowdfunding"
            line="Pledges, in their three states: paid (the business has it), reserved (set aside, still inside the balance above), returned (released back)."
            why="A business that has not received the money must not appear to have. This ledger is never added to the first, and it carries its accruing return as a promise, not as cash."
          />
          <ReadAloud
            block="Standing commitments"
            line="Allowances that run on their own — a subscription, a scheduled transfer — listed per currency."
            why="They hold nothing today, so they belong to neither ledger. Hiding them would be the opposite lie: this is money that will leave without anybody approving it again."
          />
          <ReadAloud
            block="Awaiting your approval"
            line="Orders drafted and judged, waiting for a human."
            why="Counted, never counted as money: nothing is held until you approve, and what you approve settles only when its condition holds."
          />
        </div>

        <p className="mt-4 max-w-[76ch] text-xs leading-relaxed text-slate-400">
          Every figure on that card is read from PayPal on each page load, and re-read after
          anything moves money — and currencies are never added together: $20 and 15 units of
          another currency are not a sum of anything.
        </p>
      </Section>

      {/* ── 4 · Real · simulated · not built ─────────────────────────── */}
      <Section id="honesty" title="4 · What is real, what is simulated, what was never built">
        <p className="mt-3 max-w-[76ch] text-sm leading-relaxed text-slate-600">
          Three lists, kept apart — because the difference between them is the whole argument of
          the product. Nothing is presented as finished that is not.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <List title="What is real" items={REAL} tone="emerald" />
          <List title="What is simulated" items={SIMULATED} tone="slate" />
          <List title="What is not built yet" items={LEFT} tone="amber" />
        </div>
      </Section>

      {/* ── 5 · Run it ───────────────────────────────────────────────── */}
      <Section id="run" title="5 · Run it in three commands">
        <p className="mt-3 max-w-[76ch] text-sm leading-relaxed text-slate-600">
          The repository is written so that a judge who clones it gets a working app: the
          Enterprise features fall back to Community when there is no licence key, and the pages
          that need credentials say so rather than rendering an error.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-100">
{`git clone https://github.com/xenwithcode/paypal-ai-agent-gateway.git
cd paypal-ai-agent-gateway
npm install
cp env.example .env.local      # PayPal sandbox keys + Gemini key
npm run dev                    # http://localhost:3000`}
        </pre>
        <p className="mt-3 max-w-[76ch] text-xs leading-relaxed text-slate-400">
          Without credentials the app still opens: it says which figures are demo figures, and it
          refuses to invent the ones it cannot read. Tests run with{" "}
          <code className="font-mono">npm test</code> and need no keys at all.
        </p>
      </Section>

      {/* ── 6 · The vocabulary ───────────────────────────────────────── */}
      <Section id="vocabulary" title="6 · The vocabulary, in one sentence each">
        <p className="mt-3 max-w-[76ch] text-sm leading-relaxed text-slate-600">
          This product invented no words — but it uses a few precisely, and a screen that assumes
          the reader already knows them is a screen that loses them. Hovering any of them in the
          app gives the same sentence.
        </p>
        <dl className="mt-3 divide-y divide-slate-100">
          {VOCABULARY.map((entry) => (
            <div key={entry.word} className="py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-semibold text-slate-900">{entry.word}</dt>
              <dd className="mt-0.5 max-w-[76ch] text-xs leading-relaxed text-slate-500">
                {/* The italics are the app's own emphasis, not decoration. */}
                {entry.says.split("*").map((part, index) =>
                  index % 2 === 1 ? (
                    <em key={index} className="italic">
                      {part}
                    </em>
                  ) : (
                    <span key={index}>{part}</span>
                  )
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* ── 7 · Security ─────────────────────────────────────────────── */}
      <Section id="security" title="7 · Security posture, in four layers">
        <ol className="mt-3 max-w-[76ch] space-y-2 text-sm leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-slate-900">1 · The model is told, never
            trusted.</span> It receives <em>declarations</em> of what it may do and answers with a
            typed envelope; every call is validated on the way out before any handler runs.
          </li>
          <li>
            <span className="font-semibold text-slate-900">2 · The server judges.</span> Ceiling,
            recipient, window, mode, campaign band and goal are decided server-side, before PayPal
            is asked for anything. The voice gets no wider door than the buttons.
          </li>
          <li>
            <span className="font-semibold text-slate-900">3 · The human approves in
            PayPal.</span> No password, login or key ever reaches the model, the log or the
            bundle — the payment is approved inside PayPal&apos;s own UI.
          </li>
          <li>
            <span className="font-semibold text-slate-900">4 · Nothing is claimed that is not
            built.</span> Consent as a revocable record, and standing authorization through
            PayPal&apos;s Billing Agreement, are <em>designed</em> in the security notes and
            deliberately not shown as working.
          </li>
        </ol>
        <p className="mt-3 max-w-[76ch] text-xs leading-relaxed text-slate-400">
          The full policy — what the agent may do, what is built, and what is only designed — is
          in <span className="font-medium text-slate-500">SECURITY.md</span> at the repository
          root.
        </p>
      </Section>

      {/* ── The line it closes on ────────────────────────────────────── */}
      <p className="max-w-[76ch] rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600 shadow-sm">
        The line this product opens with, and the one it closes on:{" "}
        <span className="font-semibold text-slate-900">
          the agent requests, the server judges, the human approves.
        </span>{" "}
        Everything above is an attempt to make that true in code rather than in a diagram — and to
        say out loud, on the same screen, where it is not true yet.
      </p>

      <p className="text-xs leading-relaxed text-slate-400">
        Written by{" "}
        <span className="font-medium text-slate-500">xenwithcode</span> ·{" "}
        <a
          href="https://github.com/xenwithcode/paypal-ai-agent-gateway"
          className="font-medium text-slate-500 underline-offset-2 hover:underline"
        >
          github.com/xenwithcode/paypal-ai-agent-gateway
        </a>{" "}
        · PayPal AI Hackathon 2026. Every figure on this page is either stable, dated, or labelled
        with where it came from.
      </p>
    </div>
  );
}

// ─── The pieces ────────────────────────────────────────────────────────────

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
    >
      <h2 id={id} className="text-base font-semibold text-slate-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One state of the lifecycle, as the flow draws it. */
function StateBox({
  state,
}: {
  state: { label: string; tone: (typeof STATES)[number]["tone"]; what: string };
}) {
  const wear = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[state.tone];

  return (
    <div className={`flex min-w-[150px] flex-1 items-center rounded-xl border px-4 py-3 ${wear}`}>
      <span className="text-xs font-semibold">{state.label}</span>
    </div>
  );
}

/** The arrow, and the condition that decides which way the money goes. */
function Arrow({ label, horizontal = true }: { label: string; horizontal?: boolean }) {
  return (
    <div
      className={
        horizontal
          ? "flex min-w-[92px] shrink-0 flex-col items-center justify-center gap-1 text-center"
          : "flex items-center gap-1.5 text-right"
      }
      aria-hidden="true"
    >
      {horizontal && <span className="text-lg leading-none text-slate-300">→</span>}
      <span className="text-[10px] leading-tight text-slate-400">{label}</span>
      {!horizontal && <span className="text-lg leading-none text-slate-300">→</span>}
    </div>
  );
}

/** A block of the dashboard, the sentence it says, and why it says only that. */
function ReadAloud({ block, line, why }: { block: string; line: string; why: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold text-slate-900">{block}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{line}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
        <span className="font-semibold uppercase tracking-wide">Why it is separate · </span>
        {why}
      </p>
    </div>
  );
}

/**
 * The three honest lists, side by side.
 *
 * Kept from the page this one grew out of, and kept in the same shape on
 * purpose: a reader who has seen *Target Market* meets the same grammar here,
 * and the colour is only ever a secondary cue — each list is named in words.
 */
function List({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly { what: string; how: string }[];
  tone: "emerald" | "slate" | "amber";
}) {
  const dot =
    tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-slate-400";

  return (
    <section
      aria-label={title}
      className="rounded-xl border border-slate-100 bg-slate-50 p-4"
    >
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-900">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        {title}
      </h3>
      <dl className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.what}>
            <dt className="text-xs font-semibold text-slate-800">{item.what}</dt>
            <dd className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{item.how}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const REAL = [
  {
    what: "Money, in the sandbox",
    how: "Orders are created, authorized and captured against a live PayPal sandbox account — real ids, real authorization expiry, real refusals.",
  },
  {
    what: "Every judgement",
    how: "Ceiling, window, recipient, mode, a campaign's band and its goal are decided on the server, before PayPal is asked for anything.",
  },
  {
    what: "The ledger",
    how: "Activity is PayPal's own transaction search; balances are re-read after anything moves money, so the cards cannot drift from the account.",
  },
  {
    what: "The model, in two voices",
    how: "Gemini for the typed intent, Gemini Live for speech; both call tools the browser executes through the same handlers the buttons use.",
  },
  {
    what: "The exchange rate",
    how: "Read from the official BCV feed. If it cannot be reached the app says so instead of converting at a plausible number.",
  },
];

const SIMULATED = [
  {
    what: "The product catalogue",
    how: "Labelled `demo-catalog` on the page. No free source of real prices exists; pretending one does is the kind of claim this project refuses.",
  },
  {
    what: "The four funding campaigns",
    how: "Labelled on every row: real structure and coordinates, no audit behind them. The pledge in section 2 is a real sandbox record against one of them.",
  },
  {
    what: "The Pago Móvil rail",
    how: "A preview, and it says so on screen: no bank is connected in this build, so no money moves. The rate it shows is real.",
  },
  {
    what: "The sample rows",
    how: "The dashboard seeds itself so a first-time reader has something to look at. They wear a SAMPLE chip in the row itself, and are replaced rather than merged with real ones.",
  },
];

const LEFT = [
  {
    what: "Standing consent (level 3)",
    how: "Charging later without asking again, through PayPal's own Billing Agreement, inside ceilings and revocable in one action. Designed in SECURITY.md, deliberately not shown as built.",
  },
  {
    what: "Real subscriptions",
    how: "The recurring page lists real billing plans, but createSubscription is not wired: the standing commitments on Overview are allowances held in the local store.",
  },
  {
    what: "Authentication",
    how: "The store and the API are localhost-only. Required before this is exposed to the internet — the same roadmap item as public hosting.",
  },
  {
    what: "The public release",
    how: "Hosted on Google Cloud, with the architecture diagram refreshed and the repository made public.",
  },
];
