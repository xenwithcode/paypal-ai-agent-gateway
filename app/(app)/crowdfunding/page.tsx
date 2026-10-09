// app/(app)/crowdfunding/page.tsx
// Server entry for Phase 3 — PayPal AI Crowdfunding.
//
// Reads and validates the shipped seed here, so the grid receives projects
// that already passed `normaliseProjects` and never has to decide what to do
// with a malformed one. It also keeps the client bundle free of the file: the
// page carries the data across, the way `/fx` carries the balance.
import seed from "@/lib/seeds/crowdfunding.json";
import { normaliseProjects } from "@/lib/crowdfunding";
import CrowdfundingView from "./CrowdfundingView";

export const metadata = {
  title: "Crowdfunding · PayPal AI Agent Gateway",
  description:
    "Fund a real business in Venezuela from $20 and receive your share in USD, outside the bank.",
};

export default function CrowdfundingPage() {
  const projects = normaliseProjects(seed);

  if (projects === null) {
    // Shipped data that no longer validates is a bug in the repository, not an
    // empty market — so it is reported here rather than rendered as one.
    console.error(
      "[/crowdfunding] the shipped seed does not normalise; the showcase will show its empty state."
    );
  }

  return (
    <CrowdfundingView
      projects={projects ?? []}
      // Read here rather than in the component, exactly as Overview and Send
      // do it: the credential-bearing module never reaches client code.
      paypalClientId={process.env.PAYPAL_CLIENT_ID ?? ""}
    />
  );
}
