// app/(app)/recurring/page.tsx
import { CreditCard } from "lucide-react";
import EmptyState from "../components/EmptyState";

export const metadata = { title: "Recurring payments · PayPal AI Agent Gateway" };

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

      <EmptyState
        icon={CreditCard}
        title="No recurring payments yet"
        description="Add a service and your agent covers each charge automatically, inside a monthly limit you set. Pause or remove any of them whenever you want."
        action={{ label: "Add a payment", disabled: true }}
        note="Adding and removing services arrives in the next iteration — the list and both actions belong here."
      />
    </>
  );
}
