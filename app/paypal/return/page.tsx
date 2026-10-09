// app/paypal/return/page.tsx
//
// Where PayPal sends the browser back after an approval.
//
// This route existed as a *default* in the order's `return_url` while having
// two defects stacked: it pointed at port 3001 while the app runs on 3000, and
// the path itself returned 404. A payer who was redirected came back to a dead
// end — the worst possible moment to lose somebody, because it is the moment
// they cannot tell whether they were charged.
//
// Deliberately outside the `(app)` group: this is a landing strip, not a
// workspace. It renders in the root layout, with no sidebar and nothing to
// hydrate, so it works even when the reason for arriving here is that
// something else went wrong.
//
// It charges nothing and claims nothing about the order: the SDK approves
// in-page, so by the time somebody lands here the approval has already been
// handled (or not) elsewhere. What it can honestly say is where to look.
import Link from "next/link";

export const metadata = {
  title: "Back from PayPal · PayPal AI Agent Gateway",
};

type Search = { token?: string; order_id?: string };

export default async function PayPalReturnPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const reference = params.token ?? params.order_id ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-[60ch] flex-col justify-center gap-5 px-6 py-16">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        PayPal AI Agent Gateway
      </p>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        PayPal sent you back
      </h1>

      <p className="text-sm leading-relaxed text-slate-600">
        Your approval happened on PayPal&apos;s own page. <strong>This screen charged nothing</strong>{" "}
        and holds nothing: what actually happened is recorded where every other decision in this
        product is recorded — the order, the console line, and the balance.
      </p>

      {reference && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-600">
          reference {reference}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/overview"
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Open Overview to see it
        </Link>
        <Link
          href="/crowdfunding"
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Back to the showcase
        </Link>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        Nothing appears there if nothing was authorized — an approval that failed leaves no row, and
        the console line saying so is the record of the attempt.
      </p>
    </main>
  );
}
