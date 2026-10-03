// app/(app)/recurring/page.tsx
import RecurringView from "./RecurringView";

export const metadata = { title: "Recurring payments · PayPal AI Agent Gateway" };

/**
 * The heading states the rule this section implements — add one once, runs
 * until you remove it — and the view lists exactly the orders that follow it:
 * active, with no condition left to satisfy.
 */
export default function RecurringPage() {
  return (
    <>
      <header className="px-6 pt-8 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recurring payments</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
          Services your agent keeps paid on schedule — Spotify, Netflix, Prime Video. You add one
          once; it runs on its own until you take it off.
        </p>
      </header>

      <div className="px-6 pt-6 md:px-8">
        <RecurringView />
      </div>
    </>
  );
}
