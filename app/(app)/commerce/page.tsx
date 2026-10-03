// app/(app)/commerce/page.tsx
import { ScrollText } from "lucide-react";
import EmptyState from "../components/EmptyState";

export const metadata = { title: "Agentic Commerce · PayPal AI Agent Gateway" };

/**
 * Named for the category rather than for a protocol.
 *
 * Two incompatible standards are already competing for it — ACP, from OpenAI
 * and Stripe, and UCP, co-developed by Google and Shopify — and siding with
 * either one in a section of our own product would date the page the moment
 * that one loses. The work here is identical whichever standard carries the
 * order: a structured record a machine can check before money moves.
 */
export default function AgenticCommercePage() {
  return (
    <>
      <header className="px-6 pt-8 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agentic Commerce</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
          Turns a spoken intent into a manifest a machine can check: what to buy, from whom, up to
          how much, and the exact condition that releases payment. Protocols such as ACP and UCP
          carry the order between agent and merchant — this is the rule that governs it before it
          is allowed to move.
        </p>
      </header>

      <EmptyState
        icon={ScrollText}
        title="No manifests yet"
        description="Draft an order from the Overview and its manifest appears here for review — the ceiling, the endpoint it may reach, and the condition that releases the money, all read back before anything is authorised."
        action={{ label: "Draft an order", href: "/overview" }}
        note="What this section shows is still being specified."
      />
    </>
  );
}
