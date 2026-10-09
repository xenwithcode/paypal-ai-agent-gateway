// app/paypal/cancel/page.tsx
//
// The other exit: the payer pressed "cancel" on PayPal's side. Nothing was
// authorized and nothing is held, and saying exactly that is the whole job of
// this page — the failure people fear at this moment is being charged anyway,
// and a screen that says so plainly is worth more than one that explains the
// flow.
//
// Outside the `(app)` group for the same reason as its sibling: a landing
// strip, no sidebar, nothing to hydrate.
import Link from "next/link";

export const metadata = {
  title: "Cancelled · PayPal AI Agent Gateway",
};

export default function PayPalCancelPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[60ch] flex-col justify-center gap-5 px-6 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        PayPal AI Agent Gateway
      </p>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        You cancelled in PayPal
      </h1>

      <p className="text-sm leading-relaxed text-slate-600">
        <strong>Nothing was authorized and no money moved.</strong> The pledge was never created, so
        there is no order to worry about and nothing waiting in the background.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/crowdfunding"
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Back to the showcase
        </Link>
        <Link
          href="/overview"
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Open Overview
        </Link>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        The console on Overview records this attempt too, so a cancelled pledge is never the same as
        one nobody can explain.
      </p>
    </main>
  );
}
