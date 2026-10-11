// app/(app)/overview/page.tsx
import seed from "@/lib/seeds/crowdfunding.json";
import { getAllBalances, getBalance } from "@/lib/paypal";
import { normaliseProjects } from "@/lib/crowdfunding";
import AgentGrid from "./components/AgentGrid";

// Forces Next.js to read live data from the PayPal SDK on every request.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  // Read the balance server-side — the secret never reaches the browser. What
  // passes down is the figure *and where it came from*, so the screen can say
  // when it is showing a demo number instead of quietly presenting one.
  //
  // Two requests, because they are two questions: the headline picks one
  // currency by rule, and the ring needs *every* currency the account holds —
  // and this product will not add them together. Both are the same REST call
  // PayPal answers in one round trip each.
  const [balance, balances] = await Promise.all([getBalance(), getAllBalances()]);

  // Only the client id crosses over: PayPal documents it as safe to expose,
  // and the secret stays behind with everything else in this module.
  const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? "";

  // The rates the campaigns offer, so the position card can say what a
  // pledge accrues. Only what the card needs crosses over — an id and a
  // percent — because the showcase itself belongs to `/crowdfunding` and a
  // copy of it here is a second catalogue that would drift from the first.
  const campaigns = (normaliseProjects(seed) ?? []).map((project) => ({
    id: project.id,
    returnPct: project.returnPct,
  }));

  // Padding only: the (app) layout owns the page background and the sidebar offset.
  return (
    <main className="py-8">
      <AgentGrid
        balance={balance}
        balances={balances}
        campaigns={campaigns}
        paypalClientId={paypalClientId}
      />
    </main>
  );
}
