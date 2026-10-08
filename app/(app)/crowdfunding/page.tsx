// app/(app)/crowdfunding/page.tsx
// Server entry for Phase 3 — PayPal AI Crowdfunding.
//
// Deliberately carries no data of its own: nothing here needs a credential,
// and the moment it does (a live balance, a project list read server-side),
// this is where it belongs — the same rule `/fx` follows, so a
// credential-bearing module is never imported by client code.
import CrowdfundingView from "./CrowdfundingView";

export const metadata = {
  title: "Crowdfunding · PayPal AI Agent Gateway",
  description:
    "Fund a real business in Venezuela from $20 and receive your share in USD, outside the bank.",
};

export default function CrowdfundingPage() {
  return <CrowdfundingView />;
}
