// app/(app)/activity/page.tsx
import { Activity } from "lucide-react";
import ActivityView from "./ActivityView";

export const metadata = { title: "Activity · PayPal AI Agent Gateway" };

/**
 * The ledger. Heading and description stay on screen only — printing them
 * would put the app's own marketing above the report the user asked for.
 */
export default function ActivityPage() {
  return (
    <>
      <header className="px-6 pt-8 md:px-8 print:hidden">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Activity</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
          Everything your agent has done in one ledger: the purchases it completed, and the charges
          it stopped before they happened. Neither is recorded anywhere else.
        </p>
      </header>

      <div className="px-6 pt-6 md:px-8">
        <ActivityView />
      </div>

      {/* Screen-only pointer to where new entries come from. */}
      <p className="flex items-center justify-center gap-2 px-6 pb-8 pt-4 text-center text-xs text-slate-400 print:hidden">
        <Activity className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        Capture an order from the Overview and it appears here.
      </p>
    </>
  );
}
