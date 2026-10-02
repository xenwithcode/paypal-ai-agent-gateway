// app/(app)/ucp/page.tsx
import { ScrollText } from "lucide-react";
import EmptyState from "../components/EmptyState";

export const metadata = { title: "UCP Commerce · PayPal AI Agent Gateway" };

export default function UcpCommercePage() {
  return (
    <>
      <header className="px-6 pt-8 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">UCP Commerce</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
          The Universal Commerce Protocol turns a spoken intent into a manifest a machine can
          check: what to buy, from whom, up to how much, and the exact condition that releases
          payment.
        </p>
      </header>

      <EmptyState
        icon={ScrollText}
        title="No manifests yet"
        description="Generate a policy from the Overview and its manifest appears here for review — before a single unit of currency moves."
        action={{ label: "Go to Overview", href: "/overview" }}
        note="What this section shows is still being specified."
      />
    </>
  );
}
