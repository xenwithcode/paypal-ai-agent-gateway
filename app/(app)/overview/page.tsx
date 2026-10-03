// app/(app)/overview/page.tsx
import { getBalance } from "@/lib/paypal";
import AgentGrid from "./components/AgentGrid";

// Forces Next.js to read live data from the PayPal SDK on every request.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  // Read the balance server-side — the secret never reaches the browser. What
  // passes down is the figure *and where it came from*, so the screen can say
  // when it is showing a demo number instead of quietly presenting one.
  const balance = await getBalance();

  // Padding only: the (app) layout owns the page background and the sidebar offset.
  return (
    <main className="py-8">
      <AgentGrid balance={balance} />
    </main>
  );
}
