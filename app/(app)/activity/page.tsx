// app/(app)/activity/page.tsx
import { Activity } from "lucide-react";
import EmptyState from "../components/EmptyState";

export const metadata = { title: "Activity · PayPal AI Agent Gateway" };

export default function ActivityPage() {
  return (
    <>
      <header className="px-6 pt-8 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Activity</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
          Everything your agent has done in one ledger: money in, money out, refunds, and the
          charges it stopped before they happened.
        </p>
      </header>

      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Once your agent starts moving money, every event lands here. Charges it blocks are recorded here too — a payment that was stopped never reaches PayPal, so this ledger is the only place it exists."
        note="Fills in once PayPal credentials are configured and the agent has run."
      />
    </>
  );
}
