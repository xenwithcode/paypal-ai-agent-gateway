// app/(app)/fx/page.tsx
"use client";

import { Coins } from "lucide-react";
import EmptyState from "../components/EmptyState";
import { useFxShield } from "../hooks/useFxShield";

export default function FxShieldPage() {
  const { enabled, ready } = useFxShield();

  return (
    <>
      <header className="px-6 pt-8 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">FX Shield</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
          Converts a balance that would otherwise lose value in a devaluing currency into PYUSD
          the moment it arrives, and converts it back at the moment you actually spend.
        </p>
      </header>

      {enabled ? (
        <EmptyState
          icon={Coins}
          title="FX Shield is on"
          description="Any VES that lands is converted to PYUSD automatically so inflation cannot erode it while it sits. Your local payment rails are unlocked."
          action={{ label: "Open Pago Móvil", href: "/fx/pago-movil" }}
        />
      ) : (
        <EmptyState
          icon={Coins}
          title="FX Shield is off"
          description={
            ready
              ? "Turn it on in the sidebar to protect an incoming VES balance and unlock the local payment rails."
              : "Checking your FX Shield setting…"
          }
          note="This section is optional. If your currency is stable and freely convertible, you never need to switch it on — the rest of the product works the same either way."
        />
      )}
    </>
  );
}
