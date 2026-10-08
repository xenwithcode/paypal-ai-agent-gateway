// app/(app)/crowdfunding/CrowdfundingView.tsx
"use client";

import { Sprout } from "lucide-react";
import EmptyState from "../components/EmptyState";

/**
 * The showcase, before there is anything in it.
 *
 * Phase 3 in one screen: the section exists, is reachable, and says what it
 * will do — without pretending a single project is funded. Every number in the
 * copy is a promise about the product, not a figure about today: "from $20"
 * is the minimum the model will allow, and "audited before it is listed" is
 * the rule the risk committee follows, not an audit that has happened.
 *
 * The button is disabled rather than absent. A missing button reads as a
 * section that is broken; a disabled one reads as a section that is coming,
 * and it says so out loud in the label.
 */
export default function CrowdfundingView() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          PayPal AI Crowdfunding
        </h1>
        <p className="max-w-[70ch] text-sm leading-relaxed text-slate-500">
          Finance a real business in Venezuela from $20 and receive your share in
          USD — outside the bank, which lends less to a whole country than its
          digital economy moves in a week. You choose where your money goes; the
          platform audits the business and holds it to the terms before a
          cent is released.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <EmptyState
          icon={Sprout}
          title="No projects are open yet"
          description="Every business is verified before it appears here: two years of
          invoices, stock you can see, and collateral worth more than what it
          asks for. When the first one is ready, it opens with its goal, its
          return, and exactly what your money is for — and you decide."
          action={{ label: "Invest from $20", disabled: true }}
          note="Nothing has been funded through this screen yet. The showcase opens
          with the first audited project; until then this section states what
          it will do rather than what it has done."
        />
      </div>
    </div>
  );
}
