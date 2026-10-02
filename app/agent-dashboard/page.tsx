// app/agent-dashboard/page.tsx
import { getPYUSDBalance } from "@/lib/paypal";
import AgentGrid from "./components/AgentGrid";

// Forces Next.js to read live data from the PayPal SDK on every request.
export const dynamic = "force-dynamic";

export default async function AgentDashboardPage() {
  // Read the real PYUSD balance server-side — the secret never reaches the
  // browser; only this pre-formatted string is passed down as a prop.
  const pyusdBalance = await getPYUSDBalance();

  return (
    <main className="min-h-screen bg-slate-50/50 py-8">
      <AgentGrid initialBalance={pyusdBalance} />
    </main>
  );
}
