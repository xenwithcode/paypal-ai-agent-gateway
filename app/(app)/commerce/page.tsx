// app/(app)/commerce/page.tsx
import CommerceView from "./CommerceView";

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

      <div className="px-6 pt-6 md:px-8">
        <CommerceView />
      </div>
    </>
  );
}
